import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideBadgeCheck,
  lucideCircleCheck,
  lucideCircleX,
  lucideClock,
} from '@ng-icons/lucide';
import { BrnDialogRef, injectBrnDialogContext } from '@spartan-ng/brain/dialog';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmCheckboxImports } from '@spartan-ng/helm/checkbox';
import { HlmDialogImports } from '@spartan-ng/helm/dialog';
import { HlmSeparator } from '@spartan-ng/helm/separator';
import { HlmTextarea } from '@spartan-ng/helm/textarea';
import {
  Quote,
  QuoteItem,
  QuoteItemKind,
  QuotesApiService,
} from '../../domains/quotes';
import {
  apiErrorMessage,
  isoDay,
  money,
  num,
  quoteTotal,
} from '@foundry/shared-util';
import { StatusBadge } from '@foundry/shared-ui';

export interface QuoteDetailDialogContext {
  quote: Quote;
}

interface Section {
  kind: QuoteItemKind;
  title: string;
  note?: string;
  suffix?: string;
  items: QuoteItem[];
}

const SECTIONS: Omit<Section, 'items'>[] = [
  { kind: 'milestone', title: 'Milestones', note: 'Each invoiced once you sign it off' },
  { kind: 'standard', title: 'Items' },
  { kind: 'option', title: 'Options', note: 'Only included options are in the total' },
  { kind: 'recurring', title: 'Recurring', note: 'Monthly, not in the total', suffix: ' / mo' },
  { kind: 'pass_through', title: 'Pass-through costs', note: 'Billed at cost, estimate' },
];

/** view: reading; accept / decline: confirming that answer; done: answered. */
type Mode = 'view' | 'accept' | 'decline' | 'done';

/**
 * A quote as the client sees it. A sent, unexpired quote can be answered
 * here: tick the options to include (the total follows), then accept or
 * decline - each through its own confirmation step. Closes with the updated
 * quote after an answer, undefined otherwise.
 */
@Component({
  selector: 'app-quote-detail-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgIcon,
    HlmButton,
    HlmCheckboxImports,
    HlmDialogImports,
    HlmSeparator,
    HlmTextarea,
    StatusBadge,
  ],
  providers: [
    provideIcons({ lucideBadgeCheck, lucideCircleCheck, lucideCircleX, lucideClock }),
  ],
  template: `
    <div hlmDialogHeader>
      <div class="flex items-center gap-3 pr-6">
        <h3 hlmDialogTitle class="font-mono text-base">{{ quote().number }}</h3>
        <app-status-badge [status]="quote().status" />
      </div>
      <p hlmDialogDescription>
        Issued {{ isoDay(quote().issueDate) }} · Valid until
        {{ isoDay(quote().validUntil) }}
      </p>
    </div>

    @if (mode() === 'done') {
      <div class="flex flex-col items-center gap-3 py-8 text-center">
        <div
          class="grid h-12 w-12 place-items-center rounded-full"
          [class]="quote().status === 'accepted' ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground'"
        >
          <ng-icon [name]="quote().status === 'accepted' ? 'lucideCircleCheck' : 'lucideCircleX'" size="24" />
        </div>
        <div>
          <p class="text-sm font-semibold">
            {{ quote().status === 'accepted' ? 'Quote accepted' : 'Quote declined' }}
          </p>
          <p class="mt-1 max-w-sm text-xs text-muted-foreground">
            @if (quote().status === 'accepted') {
              Thanks - the team has been told and will set up the project. You'll
              see it under Projects once it starts.
            } @else {
              The team has been told. They may follow up with a revised quote.
            }
          </p>
        </div>
        <button hlmBtn size="sm" variant="outline" type="button" (click)="dialogRef.close(quote())">
          Done
        </button>
      </div>
    } @else {
      @if (answeredBanner(); as b) {
        <div
          class="flex items-start gap-2.5 rounded-lg px-3 py-2.5 text-xs"
          [class]="b.accepted ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'"
        >
          <ng-icon [name]="b.accepted ? 'lucideBadgeCheck' : 'lucideCircleX'" size="15" class="mt-px shrink-0" />
          <span>
            {{ b.accepted ? 'Accepted' : 'Declined' }} by {{ b.who }} on {{ b.date }}
            @if (b.note) { <span class="mt-0.5 block text-muted-foreground">"{{ b.note }}"</span> }
          </span>
        </div>
      } @else if (expired()) {
        <div class="flex items-start gap-2.5 rounded-lg bg-warning/10 px-3 py-2.5 text-xs text-warning">
          <ng-icon name="lucideClock" size="15" class="mt-px shrink-0" />
          This quote expired on {{ isoDay(quote().validUntil) }}. Ask the team for an updated one.
        </div>
      }

      <div class="scrollbar-thin max-h-[45vh] overflow-y-auto rounded-lg border border-border">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-border bg-muted/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <th class="px-3 py-2 font-medium">Description</th>
              <th class="hidden px-3 py-2 text-right font-medium sm:table-cell">Qty</th>
              <th class="hidden px-3 py-2 text-right font-medium sm:table-cell">Rate</th>
              <th class="px-3 py-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          @for (sec of sections(); track sec.kind) {
            <tbody>
              @if (showHeadings()) {
                <tr class="border-b border-border bg-muted/20">
                  <td colspan="4" class="px-3 py-1.5">
                    <span class="text-xs font-semibold">{{ sec.title }}</span>
                    @if (sec.note) {
                      <span class="ml-1.5 text-[11px] text-muted-foreground">
                        {{ sec.kind === 'option' && canAnswer() ? 'Tick the ones you want included' : sec.note }}
                      </span>
                    }
                  </td>
                </tr>
              }
              @for (item of sec.items; track item.id; let i = $index) {
                <tr
                  class="border-b border-border/50 last:border-0"
                  [class.text-muted-foreground]="sec.kind === 'option' && !isPicked(item)"
                >
                  <td class="px-3 py-2.5 align-top">
                    <span class="flex items-baseline gap-2">
                      @if (sec.kind === 'milestone') {
                        <span class="font-mono text-[10px] font-semibold text-primary">M{{ pad(i + 1) }}</span>
                      }
                      @if (sec.kind === 'option' && canAnswer() && mode() === 'view') {
                        <hlm-checkbox
                          class="translate-y-0.5"
                          [checked]="isPicked(item)"
                          (checkedChange)="toggleOption(item.id, $event)"
                          [attr.aria-label]="'Include ' + item.description"
                        />
                      }
                      <span>{{ item.description }}</span>
                      @if (sec.kind === 'option' && !(canAnswer() && mode() === 'view')) {
                        <span
                          class="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                          [class]="isPicked(item) ? 'bg-success/12 text-success' : 'bg-muted text-muted-foreground'"
                        >{{ isPicked(item) ? 'Included' : 'Not included' }}</span>
                      }
                    </span>
                    @if (item.details) {
                      <span class="mt-1 block whitespace-pre-line text-xs text-muted-foreground">{{ item.details }}</span>
                    }
                  </td>
                  <td class="hidden px-3 py-2.5 text-right align-top tabular-nums text-muted-foreground sm:table-cell">
                    {{ item.quantity }}
                  </td>
                  <td class="hidden px-3 py-2.5 text-right align-top tabular-nums text-muted-foreground sm:table-cell">
                    {{ money(item.rate, quote().currency) }}
                  </td>
                  <td class="px-3 py-2.5 text-right align-top font-medium tabular-nums">
                    {{ money(num(item.quantity) * num(item.rate), quote().currency) }}{{ sec.suffix ?? '' }}
                  </td>
                </tr>
              }
            </tbody>
          }
        </table>
      </div>

      <div class="ml-auto w-full space-y-1 text-sm sm:w-64">
        <div class="flex justify-between text-muted-foreground">
          <span>Subtotal</span><span class="tabular-nums">{{ money(totals().subtotal, quote().currency) }}</span>
        </div>
        @if (num(quote().taxRate) > 0) {
          <div class="flex justify-between text-muted-foreground">
            <span>Tax ({{ quote().taxRate }}%)</span><span class="tabular-nums">{{ money(totals().tax, quote().currency) }}</span>
          </div>
        }
        <hr hlmSeparator />
        <div class="flex justify-between font-semibold">
          <span>Total</span><span class="tabular-nums">{{ money(totals().total, quote().currency) }}</span>
        </div>
        @if (totals().recurring) {
          <div class="flex justify-between pt-1 text-xs text-muted-foreground">
            <span>Then monthly</span><span class="tabular-nums">{{ money(totals().recurring, quote().currency) }} / mo</span>
          </div>
        }
        @if (totals().passThrough) {
          <div class="flex justify-between text-xs text-muted-foreground">
            <span>Plus at-cost (est.)</span><span class="tabular-nums">{{ money(totals().passThrough, quote().currency) }}</span>
          </div>
        }
        @if (num(quote().retentionPercent) > 0) {
          <p class="pt-1 text-[11px] text-muted-foreground">
            {{ num(quote().retentionPercent) }}% of each milestone is held until the final milestone is signed off.
          </p>
        }
      </div>

      @if (quote().notes && mode() === 'view') {
        <p class="whitespace-pre-line rounded-lg bg-muted/60 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
          {{ quote().notes }}
        </p>
      }

      @if (canAnswer()) {
        @switch (mode()) {
          @case ('accept') {
            <div class="rounded-lg border border-primary/30 bg-primary/5 p-3.5">
              <p class="text-sm font-semibold">Accept {{ quote().number }}?</p>
              <p class="mt-1 text-xs leading-5 text-muted-foreground">
                You're agreeing to {{ money(totals().total, quote().currency) }}{{ optionsPhrase() }},
                on the terms in this quote. The team is notified and will start the project.
              </p>
              @if (error()) { <p class="mt-2 break-words text-xs text-destructive">{{ error() }}</p> }
              <div class="mt-3 flex flex-wrap justify-end gap-2">
                <button hlmBtn variant="ghost" size="sm" type="button" [disabled]="busy()" (click)="mode.set('view')">Back</button>
                <button hlmBtn size="sm" type="button" class="gap-1.5" [disabled]="busy()" (click)="accept()">
                  <ng-icon name="lucideBadgeCheck" size="14" />
                  {{ busy() ? 'Accepting…' : 'Confirm and accept' }}
                </button>
              </div>
            </div>
          }
          @case ('decline') {
            <div class="rounded-lg border border-border p-3.5">
              <p class="text-sm font-semibold">Decline {{ quote().number }}?</p>
              <label for="decline-reason" class="mt-1 block text-xs text-muted-foreground">
                Optional: let the team know why, so they can come back with something that fits.
              </label>
              <textarea
                #reason
                id="decline-reason"
                hlmTextarea
                rows="3"
                maxlength="2000"
                class="mt-2 w-full text-sm"
                placeholder="e.g. Over budget for this quarter"
                [value]="declineReason()"
                (input)="declineReason.set(reason.value)"
              ></textarea>
              @if (error()) { <p class="mt-2 break-words text-xs text-destructive">{{ error() }}</p> }
              <div class="mt-3 flex flex-wrap justify-end gap-2">
                <button hlmBtn variant="ghost" size="sm" type="button" [disabled]="busy()" (click)="mode.set('view')">Back</button>
                <button hlmBtn variant="destructive" size="sm" type="button" [disabled]="busy()" (click)="decline()">
                  {{ busy() ? 'Declining…' : 'Confirm decline' }}
                </button>
              </div>
            </div>
          }
          @default {
            <div hlmDialogFooter class="flex-wrap gap-2 border-t border-border pt-3">
              <button hlmBtn variant="ghost" size="sm" type="button" (click)="startDecline()">Decline</button>
              <button hlmBtn size="sm" type="button" class="gap-1.5" (click)="startAccept()">
                <ng-icon name="lucideBadgeCheck" size="14" />
                Accept quote
              </button>
            </div>
          }
        }
      }
    }
  `,
})
export class QuoteDetailDialog {
  protected readonly dialogRef = inject<BrnDialogRef<Quote | undefined>>(BrnDialogRef);
  protected readonly ctx = injectBrnDialogContext<QuoteDetailDialogContext>();
  private readonly api = inject(QuotesApiService);

  protected readonly isoDay = isoDay;
  protected readonly money = money;
  protected readonly num = num;

  protected readonly quote = signal<Quote>(this.ctx.quote);
  protected readonly mode = signal<Mode>('view');
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly declineReason = signal('');
  /** Option ids the client wants included (starts from what was quoted). */
  private readonly picked = signal<ReadonlySet<string>>(
    new Set(this.ctx.quote.items.filter((it) => it.kind === 'option' && it.selected).map((it) => it.id)),
  );

  protected readonly expired = computed(() => {
    const end = new Date(this.quote().validUntil);
    end.setUTCHours(23, 59, 59, 999);
    return end.getTime() < Date.now();
  });

  /** Mirrors the API: a sent, unexpired quote that isn't a project yet. */
  protected readonly canAnswer = computed(
    () => this.quote().status === 'sent' && !this.expired(),
  );

  protected readonly answeredBanner = computed(() => {
    const q = this.quote();
    if (!q.respondedAt || (q.status !== 'accepted' && q.status !== 'declined')) return null;
    return {
      accepted: q.status === 'accepted',
      who: (q.respondedBy ?? '').replace(/\s*<[^>]*>$/, '') || 'your team',
      date: isoDay(q.respondedAt),
      note: q.responseNote,
    };
  });

  /** Totals follow the options ticked so far. */
  protected readonly totals = computed(() =>
    quoteTotal({
      taxRate: this.quote().taxRate,
      items: this.quote().items.map((it) =>
        it.kind === 'option' ? { ...it, selected: this.isPicked(it) } : it,
      ),
    }),
  );

  protected readonly hasOptions = computed(() =>
    this.quote().items.some((it) => it.kind === 'option'),
  );
  protected readonly pickedOptions = computed(() =>
    this.quote()
      .items.filter((it) => it.kind === 'option' && this.isPicked(it))
      .map((it) => it.description),
  );

  /** " including iOS build" / " without any of the options" / "" - for the confirm sentence. */
  protected readonly optionsPhrase = computed(() => {
    if (!this.hasOptions()) return '';
    const picked = this.pickedOptions();
    return picked.length
      ? ` including ${picked.join(', ')}`
      : ' without any of the options';
  });

  protected readonly sections = computed<Section[]>(() =>
    SECTIONS.map((s) => ({
      ...s,
      items: this.quote().items.filter((it) => (it.kind ?? 'standard') === s.kind),
    })).filter((s) => s.items.length),
  );

  /** A plain quote (only standard lines) reads as one table, no headings. */
  protected readonly showHeadings = computed(
    () => !(this.sections().length === 1 && this.sections()[0].kind === 'standard'),
  );

  protected isPicked(item: QuoteItem): boolean {
    return this.picked().has(item.id);
  }

  protected toggleOption(id: string, on: boolean): void {
    this.picked.update((s) => {
      const next = new Set(s);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
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
    if (this.busy()) return;
    this.busy.set(true);
    const optionIds = this.hasOptions() ? [...this.picked()] : undefined;
    this.api.accept(this.quote().id, optionIds).subscribe({
      next: (q) => this.answered(q),
      error: (err) => this.failed(err),
    });
  }

  protected decline(): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.api.decline(this.quote().id, this.declineReason().trim() || undefined).subscribe({
      next: (q) => this.answered(q),
      error: (err) => this.failed(err),
    });
  }

  private answered(q: Quote): void {
    this.busy.set(false);
    this.quote.set(q);
    this.mode.set('done');
  }

  private failed(err: unknown): void {
    this.busy.set(false);
    this.error.set(apiErrorMessage(err));
  }

  protected pad(n: number): string {
    return String(n).padStart(2, '0');
  }
}
