import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideBadgeCheck,
  lucideCheck,
  lucideChevronDown,
  lucideChevronRight,
  lucideCircleCheck,
  lucideCircleX,
  lucideClock,
  lucideDownload,
  lucideFileText,
  lucideFolderKanban,
} from '@ng-icons/lucide';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmCheckboxImports } from '@spartan-ng/helm/checkbox';
import { HlmTextarea } from '@spartan-ng/helm/textarea';
import {
  apiErrorMessage,
  fileSize,
  isoDay,
  milestoneSchedule,
  money,
  num,
  quoteTotal,
} from '@foundry/shared-util';
import { EmptyState, StatusBadge } from '@foundry/shared-ui';
import { PortalAuthService } from '../../domains/auth';
import {
  Quote,
  QuoteAttachment,
  QuoteItem,
  QuotesApiService,
} from '../../domains/quotes';
import { PortalRealtimeService } from '../../domains/realtime';
import { saveBlob } from '../../core/download-file';

/** view: reading; accept / decline: confirming that answer. */
type Mode = 'view' | 'accept' | 'decline';

interface PlanRow {
  item: QuoteItem;
  code: string;
  amount: number;
  option: boolean;
  final: boolean;
}

/**
 * A quote as the client reviews it (`/:slug/quotes/:id`), laid out like a
 * proposal: the deal at a glance, the milestone plan (collapsed, in billing
 * order - the same M-numbers as the PDF and the project), options as real
 * choices that move the total, and a decision panel that stays in reach
 * while reading. A sent, unexpired quote is answered here; afterwards the
 * page is the record of that answer.
 */
@Component({
  selector: 'app-portal-quote-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    NgIcon,
    HlmButton,
    HlmCheckboxImports,
    HlmTextarea,
    EmptyState,
    StatusBadge,
  ],
  providers: [
    provideIcons({
      lucideBadgeCheck,
      lucideCheck,
      lucideChevronDown,
      lucideChevronRight,
      lucideCircleCheck,
      lucideCircleX,
      lucideClock,
      lucideDownload,
      lucideFileText,
      lucideFolderKanban,
    }),
  ],
  templateUrl: './quote-detail.html',
})
export class QuoteDetail {
  private readonly api = inject(QuotesApiService);
  private readonly auth = inject(PortalAuthService);
  private readonly realtime = inject(PortalRealtimeService);

  /** Route param. */
  readonly id = input.required<string>();

  protected readonly loading = signal(true);
  protected readonly notFound = signal(false);
  protected readonly quote = signal<Quote | null>(null);
  protected readonly mode = signal<Mode>('view');
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly declineReason = signal('');
  protected readonly downloading = signal<string | null>(null);
  /** Option ids the client wants included (starts from what was quoted). */
  private readonly picked = signal<ReadonlySet<string>>(new Set());
  /** Milestone rows opened for reading. */
  private readonly open = signal<ReadonlySet<string>>(new Set());

  private readonly decisionCard = viewChild<ElementRef<HTMLElement>>('decision');

  protected readonly quotesLink = computed(() => `/${this.auth.slug() ?? ''}/quotes`);

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => this.load(id));
    });

    // The team editing or re-sending it arrives live.
    const destroyRef = inject(DestroyRef);
    this.realtime.quotes$
      .pipe(takeUntilDestroyed(destroyRef))
      .subscribe((change) => {
        if (change.quoteId !== this.quote()?.id || this.busy()) return;
        if (change.removed) {
          this.quote.set(null);
          this.notFound.set(true);
        } else {
          this.load(change.quoteId, true);
        }
      });
  }

  private load(id: string, quiet = false): void {
    if (!quiet) this.loading.set(true);
    this.api.get(id).subscribe({
      next: (q) => this.show(q),
      error: () => {
        this.loading.set(false);
        this.notFound.set(true);
      },
    });
  }

  private show(q: Quote): void {
    this.quote.set(q);
    this.notFound.set(false);
    this.loading.set(false);
    this.picked.set(
      new Set(q.items.filter((it) => it.kind === 'option' && it.selected).map((it) => it.id)),
    );
  }

  // ---- state ---------------------------------------------------------

  protected readonly expired = computed(() => {
    const q = this.quote();
    if (!q) return false;
    const end = new Date(q.validUntil);
    end.setUTCHours(23, 59, 59, 999);
    return end.getTime() < Date.now();
  });

  /** Whole days left to answer, while it's still open. */
  protected readonly daysLeft = computed(() => {
    const q = this.quote();
    if (!q || this.expired()) return null;
    const end = new Date(q.validUntil);
    end.setUTCHours(23, 59, 59, 999);
    return Math.max(0, Math.floor((end.getTime() - Date.now()) / 864e5));
  });

  /** Mirrors the API: a sent, unexpired quote. */
  protected readonly canAnswer = computed(
    () => this.quote()?.status === 'sent' && !this.expired(),
  );

  protected readonly answered = computed(() => {
    const q = this.quote();
    if (!q?.respondedAt || (q.status !== 'accepted' && q.status !== 'declined')) {
      return null;
    }
    return {
      accepted: q.status === 'accepted',
      who: (q.respondedBy ?? '').replace(/\s*<[^>]*>$/, '') || 'your team',
      date: isoDay(q.respondedAt),
      note: q.responseNote,
    };
  });

  protected isPicked(item: QuoteItem): boolean {
    return this.picked().has(item.id);
  }

  /** The lines with the client's current option choices applied. */
  private readonly lines = computed(() =>
    (this.quote()?.items ?? []).map((it) =>
      it.kind === 'option' ? { ...it, selected: this.isPicked(it) } : it,
    ),
  );

  protected readonly totals = computed(() =>
    quoteTotal({ taxRate: this.quote()?.taxRate ?? 0, items: this.lines() }),
  );

  /** The milestones the project will have, numbered as the PDF numbers them. */
  protected readonly plan = computed<PlanRow[]>(() => {
    const rows = milestoneSchedule(this.lines());
    return rows.map((item, i) => ({
      item,
      code: `M${String(i + 1).padStart(2, '0')}`,
      amount: num(item.quantity) * num(item.rate),
      option: item.kind === 'option',
      final: rows.length > 1 && i === rows.length - 1,
    }));
  });

  protected readonly options = computed(() =>
    (this.quote()?.items ?? []).filter((it) => it.kind === 'option'),
  );
  protected readonly standard = computed(() =>
    (this.quote()?.items ?? []).filter((it) => (it.kind ?? 'standard') === 'standard'),
  );
  protected readonly separately = computed(() =>
    (this.quote()?.items ?? [])
      .filter((it) => it.kind === 'recurring' || it.kind === 'pass_through')
      .map((it) => ({
        item: it,
        note:
          it.kind === 'recurring'
            ? 'Monthly, after launch'
            : 'Third-party cost, billed at cost (estimate)',
        suffix: it.kind === 'recurring' ? ' / month' : '',
      })),
  );

  protected readonly retention = computed(() => num(this.quote()?.retentionPercent ?? 0));

  /** "4 milestones · invoiced as you sign each off · 10% held until the final one". */
  protected readonly dealLine = computed(() => {
    const n = this.plan().length;
    if (!n) return '';
    return [
      `${n} milestone${n === 1 ? '' : 's'}`,
      'each invoiced as you sign it off',
      this.retention() > 0 && n > 1 ? `${this.retention()}% held until the final one` : '',
    ]
      .filter(Boolean)
      .join(' · ');
  });

  protected readonly pickedNames = computed(() =>
    this.options()
      .filter((it) => this.isPicked(it))
      .map((it) => it.description),
  );

  /** " including iOS app" / " without any of the options" / "". */
  protected readonly optionsPhrase = computed(() => {
    if (!this.options().length) return '';
    const names = this.pickedNames();
    return names.length ? ` including ${names.join(', ')}` : ' without any of the options';
  });

  /** Where a picked option lands in the plan ("as M03"), for its card. */
  protected planCode(item: QuoteItem): string | null {
    return this.plan().find((r) => r.item.id === item.id)?.code ?? null;
  }

  protected hasScope(it: QuoteItem): boolean {
    return !!(it.details || it.deliverables?.length || it.acceptanceCriteria);
  }

  protected scopeChip(it: QuoteItem): string {
    const n = it.deliverables?.length ?? 0;
    return [
      n ? `${n} deliverable${n === 1 ? '' : 's'}` : '',
      it.acceptanceCriteria ? 'sign-off criteria' : '',
    ]
      .filter(Boolean)
      .join(' · ');
  }

  // ---- reading -------------------------------------------------------

  protected isOpen(id: string): boolean {
    return this.open().has(id);
  }

  protected toggle(id: string): void {
    this.open.update((s) => {
      const next = new Set(s);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  protected readonly allOpen = computed(() => {
    const scoped = this.plan().filter((r) => this.hasScope(r.item));
    return scoped.length > 0 && scoped.every((r) => this.open().has(r.item.id));
  });

  protected toggleAll(): void {
    this.open.set(
      this.allOpen()
        ? new Set()
        : new Set(this.plan().filter((r) => this.hasScope(r.item)).map((r) => r.item.id)),
    );
  }

  // ---- answering -----------------------------------------------------

  protected toggleOption(id: string, on: boolean): void {
    this.picked.update((s) => {
      const next = new Set(s);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  /** Mobile bar: bring the decision panel into view. */
  protected review(): void {
    this.decisionCard()?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  protected startAccept(): void {
    this.error.set('');
    this.mode.set('accept');
  }

  protected startDecline(): void {
    this.error.set('');
    this.mode.set('decline');
  }

  protected accept(): void {
    const q = this.quote();
    if (!q || this.busy()) return;
    this.busy.set(true);
    const optionIds = this.options().length ? [...this.picked()] : undefined;
    this.api.accept(q.id, optionIds).subscribe({
      next: (updated) => this.done(updated),
      error: (err) => this.failed(err),
    });
  }

  protected decline(): void {
    const q = this.quote();
    if (!q || this.busy()) return;
    this.busy.set(true);
    this.api.decline(q.id, this.declineReason().trim() || undefined).subscribe({
      next: (updated) => this.done(updated),
      error: (err) => this.failed(err),
    });
  }

  private done(q: Quote): void {
    this.busy.set(false);
    this.mode.set('view');
    this.show(q);
  }

  private failed(err: unknown): void {
    this.busy.set(false);
    this.error.set(apiErrorMessage(err));
  }

  // ---- files ---------------------------------------------------------

  protected downloadPdf(): void {
    const q = this.quote();
    if (!q) return;
    this.downloading.set('pdf');
    this.api.downloadPdf(q.id).subscribe({
      next: (blob) => {
        this.downloading.set(null);
        saveBlob(blob, `${q.number}.pdf`);
      },
      error: (err) => {
        this.downloading.set(null);
        this.error.set(apiErrorMessage(err));
      },
    });
  }

  protected download(a: QuoteAttachment): void {
    const q = this.quote();
    if (!q) return;
    this.downloading.set(a.document.id);
    this.api.downloadAttachment(q.id, a.document.id).subscribe({
      next: (blob) => {
        this.downloading.set(null);
        saveBlob(blob, a.document.name);
      },
      error: (err) => {
        this.downloading.set(null);
        this.error.set(apiErrorMessage(err));
      },
    });
  }

  protected readonly money = (n: number | string) =>
    money(num(n), this.quote()?.currency ?? 'USD');
  protected readonly num = num;
  protected readonly isoDay = isoDay;
  protected readonly size = fileSize;
}
