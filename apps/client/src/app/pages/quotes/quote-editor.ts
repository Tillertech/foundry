import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { FormField, form, max, min, required } from '@angular/forms/signals';
import { Router, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArrowUpRight,
  lucideBadgeCheck,
  lucideChevronRight,
  lucideCircleX,
  lucideClock,
  lucideDownload,
  lucideEllipsis,
  lucideEye,
  lucideFolderKanban,
  lucideFolderPlus,
  lucidePencilLine,
  lucideRotateCcw,
  lucideSend,
  lucideTrash2,
} from '@ng-icons/lucide';
import { toast } from '@spartan-ng/brain/sonner';
import { BrnAlertDialogContent } from '@spartan-ng/brain/alert-dialog';
import { HlmAlertDialogImports } from '@spartan-ng/helm/alert-dialog';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmDialogService } from '@spartan-ng/helm/dialog';
import { HlmDropdownMenuImports } from '@spartan-ng/helm/dropdown-menu';
import { HlmInput } from '@spartan-ng/helm/input';
import { HlmTextarea } from '@spartan-ng/helm/textarea';
import { Observable, tap } from 'rxjs';
import {
  apiErrorMessage,
  Currency,
  isoDay,
  money,
  num,
  quoteTotal,
  toApiDate,
} from '@foundry/shared-util';
import {
  CurrencyAutocomplete,
  Field,
  fieldError,
  OptionAutocomplete,
  StatusBadge,
} from '@foundry/shared-ui';
import { ApiClient, ClientsApiService } from '../../domains/clients';
import { Project, ProjectsApiService } from '../../domains/projects';
import {
  CreateQuoteRequest,
  Quote,
  QuoteConversion,
  QuoteStatus,
  QuotesApiService,
  UpdateQuoteRequest,
} from '../../domains/quotes';
import {
  WorkspaceCurrencyService,
  WorkspacesApiService,
} from '../../domains/workspaces';
import { WorkspaceRealtimeService } from '../../core/realtime/workspace-realtime.service';
import { DateField } from '../../shared/date-field';
import { clientOptions } from '../../shared/entity-options';
import { ConvertQuoteDialog, ConvertQuoteDialogContext } from './convert-quote-dialog';
import { QuoteAttachmentDoc, QuoteAttachments } from './quote-attachments';
import {
  QuoteLineDraft,
  QuoteLinesEditor,
  emptyQuoteLine,
  isScoped,
  sortBySection,
} from './quote-lines-editor';
import { milestoneSchedule } from './quote-schedule';

/** The editable content. Status is never edited here - the actions move it. */
interface QuoteForm {
  number: string;
  clientId: string;
  issueDate: string;
  validUntil: string;
  currency: Currency;
  items: QuoteLineDraft[];
  taxRate: number;
  retentionPercent: number;
  notes: string;
  /** Supporting documents, locked with the lines. */
  attachments: QuoteAttachmentDoc[];
}

const today = () => new Date().toISOString().slice(0, 10);
const inDays = (n: number) =>
  new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

const blankQuote = (): QuoteForm => ({
  number: '',
  clientId: '',
  issueDate: today(),
  validUntil: inDays(30),
  currency: 'USD',
  items: [emptyQuoteLine('milestone')],
  taxRate: 0,
  retentionPercent: 0,
  notes: '',
  attachments: [],
});

const fromQuote = (q: Quote): QuoteForm => ({
  number: q.number,
  clientId: q.clientId,
  issueDate: isoDay(q.issueDate),
  validUntil: isoDay(q.validUntil),
  currency: q.currency,
  items: sortBySection(
    q.items.map((it) => ({
      id: it.id,
      kind: it.kind,
      description: it.description,
      quantity: num(it.quantity),
      rate: num(it.rate),
      details: it.details ?? '',
      estimatedHours: it.estimatedHours,
      deliverables: it.deliverables ?? [],
      acceptanceCriteria: it.acceptanceCriteria ?? '',
      selected: it.selected,
    })),
  ),
  taxRate: num(q.taxRate),
  retentionPercent: num(q.retentionPercent),
  notes: q.notes ?? '',
  attachments: (q.attachments ?? []).map((a) => a.document),
});

/** Debounce before a draft saves itself. */
const AUTOSAVE_MS = 1200;

/**
 * The quote as a document page (`/quotes/new`, `/quotes/:id`): a sticky
 * header carrying the one next action for the quote's status, the quote
 * itself in a reading-width column, and everything that isn't content -
 * details, billing schedule, attachments, the client's answer - in a side
 * rail. Drafts save themselves; once sent, changes are saved explicitly
 * because the client can already see the quote.
 */
@Component({
  selector: 'app-quote-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    NgIcon,
    FormField,
    HlmButton,
    HlmInput,
    HlmTextarea,
    HlmDropdownMenuImports,
    HlmAlertDialogImports,
    BrnAlertDialogContent,
    Field,
    StatusBadge,
    OptionAutocomplete,
    CurrencyAutocomplete,
    DateField,
    QuoteLinesEditor,
    QuoteAttachments,
  ],
  providers: [
    provideIcons({
      lucideArrowUpRight,
      lucideBadgeCheck,
      lucideChevronRight,
      lucideCircleX,
      lucideClock,
      lucideDownload,
      lucideEllipsis,
      lucideEye,
      lucideFolderKanban,
      lucideFolderPlus,
          lucidePencilLine,
      lucideRotateCcw,
      lucideSend,
      lucideTrash2,
    }),
  ],
  host: {
    class: 'block',
    '(document:keydown)': 'onKeydown($event)',
    '(window:beforeunload)': 'onBeforeUnload($event)',
  },
  templateUrl: './quote-editor.html',
})
export class QuoteEditor {
  private readonly quotesApi = inject(QuotesApiService);
  private readonly clientsApi = inject(ClientsApiService);
  private readonly projectsApi = inject(ProjectsApiService);
  private readonly workspacesApi = inject(WorkspacesApiService);
  private readonly realtime = inject(WorkspaceRealtimeService);
  private readonly dialogService = inject(HlmDialogService);
  private readonly router = inject(Router);
  protected readonly fx = inject(WorkspaceCurrencyService);

  /** Route param: a quote id, or `new`. */
  readonly id = input<string>();

  protected readonly loading = signal(true);
  protected readonly notFound = signal(false);
  /** The quote as the server last returned it; null until first saved. */
  protected readonly saved = signal<Quote | null>(null);
  protected readonly clients = signal<ApiClient[]>([]);
  protected readonly project = signal<Project | null>(null);

  protected readonly model = signal<QuoteForm>(blankQuote());
  protected readonly f = form(this.model, (p) => {
    required(p.clientId, { message: 'Select a client' });
    min(p.retentionPercent, 0, { message: 'Between 0 and 100' });
    max(p.retentionPercent, 100, { message: 'Between 0 and 100' });
  });
  protected readonly fieldError = fieldError;

  /** The model as last saved (or loaded), to tell whether there are edits. */
  private readonly savedJson = signal(JSON.stringify(blankQuote()));
  protected readonly dirty = computed(
    () => JSON.stringify(this.model()) !== this.savedJson(),
  );
  protected readonly saving = signal(false);
  protected readonly sending = signal(false);
  protected readonly preview = signal(false);
  /** The rendered PDF while previewing (an object URL), or why it failed. */
  protected readonly pdfUrl = signal<string | null>(null);
  protected readonly pdfFrame = signal<SafeResourceUrl | null>(null);
  protected readonly pdfError = signal<string | null>(null);
  private readonly sanitizer = inject(DomSanitizer);

  protected readonly isNew = computed(() => !this.saved());
  protected readonly status = computed<QuoteStatus>(
    () => this.saved()?.status ?? 'draft',
  );
  protected readonly valid = computed(
    () => this.f().valid() && this.model().items.length > 0,
  );

  protected readonly clientOptions = computed(() => clientOptions(this.clients()));
  protected readonly clientName = computed(() => {
    const c = this.clients().find((x) => x.id === this.model().clientId);
    return c ? c.company || c.name : '';
  });

  /** The client accepted this exact version: lines are read-only until it's revised. */
  protected readonly clientAccepted = computed(() => {
    const q = this.saved();
    return !!q?.respondedAt && q.status === 'accepted';
  });

  protected readonly locked = computed(
    () => !!this.saved()?.projectId || this.clientAccepted(),
  );

  protected readonly lockNote = computed(() =>
    this.saved()?.projectId
      ? "Locked: the project's milestones were created from these lines."
      : this.clientAccepted()
        ? 'Locked: the client accepted this version. Revert to draft to revise it.'
        : '',
  );

  /** Drafts save as you type; once the client can see it, saving is deliberate. */
  protected readonly autosave = computed(
    () => !!this.saved() && this.status() === 'draft' && !this.locked(),
  );

  protected readonly saveState = computed(() => {
    if (this.saving()) return 'Saving…';
    if (this.isNew()) return 'Not saved yet';
    if (!this.dirty()) return 'Saved';
    return this.autosave() && this.valid() ? 'Saving…' : 'Unsaved changes';
  });

  /** "Ada" out of "Ada <ada@x.com>". */
  protected readonly responder = computed(
    () =>
      (this.saved()?.respondedBy ?? '').replace(/\s*<[^>]*>$/, '') ||
      'The client',
  );

  /** The one filled button in the header. */
  protected readonly primary = computed<'send' | 'resend' | 'start' | 'accept' | 'project'>(
    () => {
      const q = this.saved();
      if (q?.projectId) return 'project';
      switch (this.status()) {
        case 'accepted':
          return 'start';
        case 'sent':
          return 'accept';
        case 'draft':
          return 'send';
        default:
          return 'resend';
      }
    },
  );

  protected readonly totals = computed(() => quoteTotal(this.model()));

  /** The milestones the project will get, in billing order. */
  protected readonly schedule = computed(() => {
    const rows = milestoneSchedule(this.model().items);
    return rows.map((it, i) => ({
      id: it.id,
      code: `M${String(i + 1).padStart(2, '0')}`,
      label: it.description || 'Untitled',
      option: it.kind === 'option',
      amount: it.quantity * it.rate,
      final: i === rows.length - 1,
    }));
  });

  /** Retention held across the milestone invoices, released with the last. */
  protected readonly retentionHeld = computed(() => {
    const pct = num(this.model().retentionPercent);
    const held = this.schedule()
      .slice(0, -1)
      .reduce((s, m) => s + m.amount, 0);
    return (held * pct) / 100;
  });

  constructor() {
    this.fx.refresh();
    this.clientsApi.list({ take: 100 }).subscribe({
      next: (res) => this.clients.set(res.results),
      error: () => undefined,
    });

    effect(() => {
      const id = this.id();
      untracked(() => this.load(id));
    });

    // Drafts save themselves shortly after the last edit.
    effect((onCleanup) => {
      if (!this.autosave() || !this.dirty() || !this.valid() || this.saving()) {
        return;
      }
      const timer = setTimeout(
        () =>
          untracked(() =>
            this.persist().subscribe({
              error: (err) =>
                toast.error('Could not save the draft', {
                  description: apiErrorMessage(err),
                }),
            }),
          ),
        AUTOSAVE_MS,
      );
      onCleanup(() => clearTimeout(timer));
    });

    const destroyRef = inject(DestroyRef);
    destroyRef.onDestroy(() => this.clearPdf());

    // The client answering in the portal arrives live.
    this.realtime.quotes$
      .pipe(takeUntilDestroyed(destroyRef))
      .subscribe(() => this.refreshStatus());
    this.realtime.reconnected$
      .pipe(takeUntilDestroyed(destroyRef))
      .subscribe(() => this.refreshStatus());
  }

  private load(id: string | undefined): void {
    // Just created here: the URL caught up with the saved quote.
    if (id && id === this.saved()?.id) return;
    this.preview.set(false);
    this.clearPdf();
    if (!id || id === 'new') {
      const draft = blankQuote();
      this.model.set(draft);
      this.savedJson.set(JSON.stringify(draft));
      this.saved.set(null);
      this.loading.set(false);
      // Workspace default tax, if nothing's been typed yet.
      this.workspacesApi.current().subscribe({
        next: (w) => {
          if (this.dirty() || !this.isNew()) return;
          this.model.update((m) => ({ ...m, taxRate: num(w.taxRate) }));
          this.savedJson.set(JSON.stringify(this.model()));
        },
        error: () => undefined,
      });
      return;
    }
    this.loading.set(true);
    this.quotesApi.get(id).subscribe({
      next: (q) => {
        const m = fromQuote(q);
        this.saved.set(q);
        this.model.set(m);
        this.savedJson.set(JSON.stringify(m));
        this.loadProject(q);
        this.loading.set(false);
      },
      error: () => {
        this.notFound.set(true);
        this.loading.set(false);
      },
    });
  }

  private loadProject(q: Quote): void {
    if (!q.projectId || this.project()?.id === q.projectId) return;
    this.projectsApi.get(q.projectId).subscribe({
      next: (p) => this.project.set(p),
      error: () => undefined,
    });
  }

  /** Status, response and project come from the server; the content stays as edited. */
  private refreshStatus(): void {
    const id = this.saved()?.id;
    if (!id || this.saving()) return;
    this.quotesApi.get(id).subscribe({
      next: (q) => {
        this.saved.set(q);
        this.loadProject(q);
      },
      error: () => undefined,
    });
  }

  /**
   * Preview = the real PDF the send mail attaches, rendered by the API from
   * what's on screen (unsaved edits included, nothing saved).
   */
  protected togglePreview(): void {
    if (this.preview()) {
      this.preview.set(false);
      this.clearPdf();
      return;
    }
    this.preview.set(true);
    this.renderPdf();
  }

  protected renderPdf(): void {
    this.clearPdf();
    const m = this.model();
    if (!m.clientId) {
      this.pdfError.set('Pick a client to preview the quote.');
      return;
    }
    this.quotesApi
      .previewPdf({
        ...this.body(this.status(), true),
        number: m.number.trim() || this.saved()?.number || undefined,
        clientId: m.clientId,
      } as CreateQuoteRequest)
      .subscribe({
        next: (blob) => {
          if (!this.preview()) return;
          const url = URL.createObjectURL(blob);
          this.pdfUrl.set(url);
          this.pdfFrame.set(
            this.sanitizer.bypassSecurityTrustResourceUrl(`${url}#view=FitH`),
          );
        },
        error: (err) =>
          this.pdfError.set(apiErrorMessage(err) || 'Could not render the PDF.'),
      });
  }

  private clearPdf(): void {
    const url = this.pdfUrl();
    if (url) URL.revokeObjectURL(url);
    this.pdfUrl.set(null);
    this.pdfFrame.set(null);
    this.pdfError.set(null);
  }

  protected readonly pdfName = computed(
    () => `${this.model().number.trim() || this.saved()?.number || 'quote-draft'}.pdf`,
  );

  /**
   * The request body for the current content. Locked parts are left out of
   * saves (the API refuses them); a preview always carries everything.
   */
  private body(status: QuoteStatus, everything = false): UpdateQuoteRequest {
    const v = this.model();
    return {
      number: v.number.trim() || undefined,
      status,
      issueDate: toApiDate(v.issueDate),
      validUntil: toApiDate(v.validUntil),
      taxRate: num(v.taxRate),
      retentionPercent: num(v.retentionPercent),
      notes: v.notes.trim() || undefined,
      // Lines, currency and attachments are refused server-side once locked
      // (reverting a client-accepted quote moves its status first).
      ...(this.locked() && !everything
        ? {}
        : {
            currency: v.currency,
            attachmentIds: v.attachments.map((a) => a.id),
            items: v.items.map((it) => {
              const scoped = isScoped(it.kind);
              return {
                description: it.description,
                quantity: it.quantity,
                rate: it.rate,
                kind: it.kind,
                details: scoped ? it.details.trim() || undefined : undefined,
                estimatedHours: scoped ? (it.estimatedHours ?? undefined) : undefined,
                deliverables: scoped
                  ? it.deliverables
                      .map((d) => ({ id: d.id, label: d.label.trim() }))
                      .filter((d) => d.label)
                  : undefined,
                acceptanceCriteria: scoped
                  ? it.acceptanceCriteria.trim() || undefined
                  : undefined,
                selected: it.kind === 'option' ? it.selected : undefined,
              };
            }),
          }),
    };
  }

  /**
   * Creates or updates the quote with what's on screen (optionally moving its
   * status). A new quote's URL becomes its own once created.
   */
  private persist(status: QuoteStatus = this.status()): Observable<Quote> {
    const sentJson = JSON.stringify(this.model());
    const current = this.saved();
    const body = this.body(status);
    this.saving.set(true);
    const request = current
      ? this.quotesApi.update(current.id, body)
      : this.quotesApi.create({
          ...body,
          clientId: this.model().clientId,
        } as CreateQuoteRequest);
    return request.pipe(
      tap({
        next: (q) => {
          this.saving.set(false);
          this.saved.set(q);
          this.savedJson.set(sentJson);
          // A blank number was generated server-side: show it as saved.
          if (!this.model().number.trim() && q.number) {
            this.model.update((m) => ({ ...m, number: q.number }));
            this.savedJson.set(
              JSON.stringify({ ...JSON.parse(sentJson), number: q.number }),
            );
          }
          this.fx.ensure(q.currency);
          if (!current) {
            void this.router.navigate(['/quotes', q.id], { replaceUrl: true });
          }
        },
        error: () => this.saving.set(false),
      }),
    );
  }

  protected save(): void {
    if (!this.valid() || this.saving()) return;
    const wasNew = this.isNew();
    this.persist().subscribe({
      next: () => toast.success(wasNew ? 'Draft saved' : 'Changes saved'),
      error: (err) =>
        toast.error('Could not save quote', { description: apiErrorMessage(err) }),
    });
  }

  /**
   * Emails the quote (with PDF) to the client. Unsaved edits are saved
   * first, so the client never gets an older version than the one on screen.
   */
  protected send(): void {
    if (!this.valid() || this.saving() || this.sending()) return;
    const go = (q: Quote) => {
      this.sending.set(true);
      this.quotesApi.send(q.id).subscribe({
        next: (sent) => {
          this.sending.set(false);
          this.saved.set(sent);
          toast.success('Quote sent', {
            description: `${sent.number} was emailed to the client.`,
          });
        },
        error: (err) => {
          this.sending.set(false);
          toast.error('Saved, but the quote could not be sent', {
            description: apiErrorMessage(err),
          });
        },
      });
    };
    const q = this.saved();
    if (q && !this.dirty()) {
      go(q);
      return;
    }
    this.persist().subscribe({
      next: go,
      error: (err) =>
        toast.error('Could not save quote', { description: apiErrorMessage(err) }),
    });
  }

  private readonly statusWords: Record<QuoteStatus, string> = {
    draft: 'Moved back to draft',
    sent: 'Marked as sent',
    accepted: 'Marked as accepted',
    declined: 'Marked as declined',
    expired: 'Marked as expired',
  };

  /** Moves the status (saving edits with it). Accepting leads into starting the project. */
  protected setStatus(status: QuoteStatus): void {
    if (this.saving()) return;
    if (!this.saved() && !this.valid()) return;
    this.persist(status).subscribe({
      next: (q) => {
        if (status === 'accepted' && !q.projectId) this.openConvert(q);
        else toast.success(this.statusWords[status]);
      },
      error: (err) =>
        toast.error('Could not update the quote', {
          description: apiErrorMessage(err),
        }),
    });
  }

  protected startProject(): void {
    const q = this.saved();
    if (q?.status === 'accepted' && !this.dirty()) this.openConvert(q);
    else this.setStatus('accepted');
  }

  protected runPrimary(): void {
    switch (this.primary()) {
      case 'send':
      case 'resend':
        this.send();
        break;
      case 'start':
      case 'accept':
        this.startProject();
        break;
      case 'project':
        void this.router.navigate(['/projects', this.saved()?.projectId]);
    }
  }

  private openConvert(quote: Quote): void {
    const ref = this.dialogService.open(ConvertQuoteDialog, {
      contentClass: 'sm:max-w-lg',
      context: {
        quote,
        clientName: this.clientName(),
      } satisfies ConvertQuoteDialogContext,
    });
    ref.closed$.subscribe((result) => {
      const done = result as QuoteConversion | undefined;
      if (!done) return;
      this.saved.set(done.quote);
      this.project.set(done.project);
      const parts = [
        `${done.milestoneCount} milestone${done.milestoneCount === 1 ? '' : 's'}`,
        done.upfrontInvoiceNumber
          ? `draft ${done.upfrontInvoiceNumber} raised for M01`
          : '',
      ].filter(Boolean);
      toast.success(`${done.project.name} is ready`, {
        description: parts.join(' · '),
        action: {
          label: 'Open project',
          onClick: () => this.router.navigate(['/projects', done.project.id]),
        },
      });
    });
  }

  protected remove(): void {
    const id = this.saved()?.id;
    if (!id) return;
    this.quotesApi.delete(id).subscribe({
      next: () => {
        // Nothing left to save.
        this.savedJson.set(JSON.stringify(this.model()));
        toast.success('Quote deleted');
        void this.router.navigate(['/quotes']);
      },
      error: (err) =>
        toast.error('Could not delete quote', { description: apiErrorMessage(err) }),
    });
  }

  /** Only a new quote picks its client; it's fixed once saved. */
  protected onClientChange(clientId: string): void {
    const c = this.clients().find((x) => x.id === clientId);
    const dropped = clientId !== this.model().clientId && this.model().attachments.length;
    this.model.update((m) => ({
      ...m,
      clientId,
      currency: c?.currency ?? m.currency,
      // Attachments are the previous client's documents.
      attachments: clientId === m.clientId ? m.attachments : [],
    }));
    if (dropped) {
      toast.info('Attachments removed', {
        description: "They belonged to the previous client's documents.",
      });
    }
  }

  protected onItemsChange(items: QuoteLineDraft[]): void {
    this.model.update((m) => ({ ...m, items }));
  }

  protected onAttachmentsChange(attachments: QuoteAttachmentDoc[]): void {
    this.model.update((m) => ({ ...m, attachments }));
  }

  protected onNumberInput(value: string): void {
    this.model.update((m) => ({ ...m, number: value }));
  }

  /** ⌘/Ctrl+S saves, ⌘/Ctrl+Enter runs the send action. */
  protected onKeydown(event: KeyboardEvent): void {
    if (!(event.metaKey || event.ctrlKey) || this.loading()) return;
    if (event.key === 's') {
      event.preventDefault();
      this.save();
    } else if (event.key === 'Enter') {
      const p = this.primary();
      if (p === 'send' || p === 'resend') {
        event.preventDefault();
        this.send();
      }
    }
  }

  protected onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.dirty()) event.preventDefault();
  }

  /**
   * Route guard hook. A valid draft just saves on the way out; anything else
   * with edits asks first.
   */
  canLeave(): boolean {
    if (!this.dirty() || this.notFound()) return true;
    if (this.autosave() && this.valid()) {
      this.persist().subscribe({ error: () => undefined });
      return true;
    }
    return window.confirm('You have unsaved changes on this quote. Leave without saving?');
  }

  protected readonly money = (n: number) => money(n, this.model().currency);
  protected readonly day = isoDay;
}
