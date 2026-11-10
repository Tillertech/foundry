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

import { FormField, form, max, min, required } from '@angular/forms/signals';
import { Router, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArrowUpRight,
  lucideBadgeCheck,
  lucideCircleX,
  lucideFolderKanban,
  lucideFolderPlus,
  lucidePlus,
  lucideSearch,
  lucideSend,
} from '@ng-icons/lucide';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmDialogService } from '@spartan-ng/helm/dialog';
import { HlmInput } from '@spartan-ng/helm/input';
import { HlmSelectImports } from '@spartan-ng/helm/select';
import { HlmTextarea } from '@spartan-ng/helm/textarea';
import {
  apiErrorMessage,
  Currency,
  isoDay,
  money,
  num,
  quoteTotal,
  toApiDate,
} from '@foundry/shared-util';
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
import { toast } from '@spartan-ng/brain/sonner';
import { DateField } from '../../shared/date-field';
import { EntitySheet } from '../../shared/entity-sheet';
import {
  WorkspaceCurrencyService,
  WorkspacesApiService,
} from '../../domains/workspaces';
import {
  CurrencyAutocomplete,
  Field,
  fieldError,
  OptionAutocomplete,
  PageHeader,
  StatusBadge,
} from '@foundry/shared-ui';
import { clientOptions } from '../../shared/entity-options';
import { ListSkeleton } from '../../shared/list-skeleton';
import { milestoneSchedule } from './quote-schedule';
import { WorkspaceRealtimeService } from '../../core/realtime/workspace-realtime.service';
import {
  ConvertQuoteDialog,
  ConvertQuoteDialogContext,
} from './convert-quote-dialog';
import {
  QuoteLineDraft,
  QuoteLinesEditor,
  emptyQuoteLine,
  sortBySection,
} from './quote-lines-editor';

interface QuoteForm {
  id: string;
  number: string;
  clientId: string;
  status: QuoteStatus;
  issueDate: string;
  validUntil: string;
  currency: Currency;
  items: QuoteLineDraft[];
  taxRate: number;
  retentionPercent: number;
  notes: string;
  /** Set once converted - the lines are then read-only. */
  projectId: string | null;
}

const emptyQuote = (): QuoteForm => ({
  id: '',
  number: '',
  clientId: '',
  status: 'draft',
  issueDate: new Date().toISOString().slice(0, 10),
  validUntil: new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10),
  currency: 'USD',
  items: [],
  taxRate: 0,
  retentionPercent: 0,
  notes: '',
  projectId: null,
});

@Component({
  selector: 'app-quotes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    OptionAutocomplete,
    CurrencyAutocomplete,
    FormField,
    NgIcon,
    RouterLink,
    HlmButton,
    HlmInput,
    HlmTextarea,
    HlmSelectImports,
    DateField,
    EntitySheet,
    Field,
    QuoteLinesEditor,
    ListSkeleton,
    PageHeader,
    StatusBadge,
  ],
  providers: [
    provideIcons({
      lucideArrowUpRight,
      lucideBadgeCheck,
      lucideCircleX,
      lucideFolderKanban,
      lucideFolderPlus,
      lucidePlus,
      lucideSearch,
      lucideSend,
    }),
  ],
  templateUrl: './quotes.html',
})
export class Quotes {
  private readonly quotesApi = inject(QuotesApiService);
  private readonly clientsApi = inject(ClientsApiService);
  private readonly projectsApi = inject(ProjectsApiService);
  private readonly dialogService = inject(HlmDialogService);
  private readonly router = inject(Router);
  private readonly workspacesApi = inject(WorkspacesApiService);
  private readonly realtime = inject(WorkspaceRealtimeService);

  /** `?quote=<id>` (from a notification) opens that quote once loaded. */
  readonly quote = input<string>();
  private openedFromLink: string | null = null;
  protected readonly fx = inject(WorkspaceCurrencyService);

  protected readonly loading = signal(true);
  protected readonly quotes = signal<Quote[]>([]);
  protected readonly clients = signal<ApiClient[]>([]);
  /** Projects created from quotes, for the converted-quote banner and list chip. */
  protected readonly projects = signal<Project[]>([]);
  /** Workspace default VAT/tax rate, preset on new quotes. */
  private readonly workspaceTaxRate = signal(0);

  protected readonly query = signal('');
  protected readonly statusFilter = signal('all');
  protected readonly sheetOpen = signal(false);
  protected readonly saving = signal(false);
  protected readonly sending = signal(false);
  protected isNew = true;

  protected readonly model = signal<QuoteForm>(emptyQuote());
  protected readonly f = form(this.model, (p) => {
    required(p.clientId, { message: 'Select a client' });
    min(p.retentionPercent, 0, { message: 'Between 0 and 100' });
    max(p.retentionPercent, 100, { message: 'Between 0 and 100' });
  });
  protected readonly fieldError = fieldError;

  protected readonly clientOptions = computed(() =>
    clientOptions(this.clients()),
  );

  constructor() {
    this.fx.refresh();
    this.refresh();

    // The client answering in the portal arrives live.
    const destroyRef = inject(DestroyRef);
    this.realtime.quotes$
      .pipe(takeUntilDestroyed(destroyRef))
      .subscribe(() => this.loadQuotes());
    this.realtime.reconnected$
      .pipe(takeUntilDestroyed(destroyRef))
      .subscribe(() => this.loadQuotes());

    effect(() => {
      const id = this.quote();
      const match = this.quotes().find((q) => q.id === id);
      if (match && this.openedFromLink !== match.id) {
        this.openedFromLink = match.id;
        untracked(() => this.openEdit(match));
      }
    });
  }

  private loadQuotes(): void {
    this.quotesApi.list({ take: 100 }).subscribe({
      next: (res) => {
        this.quotes.set(res.results);
        // Keep an open sheet's status in step with the server, or saving it
        // would quietly undo the client's answer.
        const open = res.results.find((q) => q.id === this.model().id);
        if (open && this.sheetOpen() && !this.saving()) {
          this.model.update((m) => ({
            ...m,
            status: open.status,
            projectId: open.projectId,
          }));
        }
      },
      error: () => undefined,
    });
  }

  private refresh(): void {
    this.quotesApi.list({ take: 100 }).subscribe({
      next: (res) => {
        this.quotes.set(res.results);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        toast.error('Could not load quotes', {
          description: apiErrorMessage(err),
        });
      },
    });
    this.clientsApi.list({ take: 100 }).subscribe({
      next: (res) => this.clients.set(res.results),
      error: () => undefined,
    });
    this.projectsApi.list({ take: 100 }).subscribe({
      next: (res) => this.projects.set(res.results),
      error: () => undefined,
    });
    this.workspacesApi.current().subscribe({
      next: (w) => this.workspaceTaxRate.set(num(w.taxRate)),
      error: () => undefined,
    });
  }

  protected readonly projectMap = computed(() =>
    Object.fromEntries(this.projects().map((p) => [p.id, p])),
  );

  /** The quote open in the sheet, as last saved. */
  private readonly current = computed(() =>
    this.quotes().find((q) => q.id === this.model().id) ?? null,
  );

  /** A saved quote that can still become a project. */
  protected readonly canConvert = computed(() => {
    const q = this.current();
    return (
      !!q && !q.projectId && q.status !== 'declined' && q.status !== 'expired'
    );
  });

  /** The saved quote, when it's accepted and only needs its project started. */
  protected readonly readyToStart = computed(() => {
    const q = this.current();
    return q && !q.projectId && q.status === 'accepted' ? q : null;
  });

  /** The saved quote, when the client declined it in the portal. */
  protected readonly declinedByClient = computed(() => {
    const q = this.current();
    return q && q.status === 'declined' && q.respondedAt ? q : null;
  });

  /**
   * The client accepted this exact version and the sheet still says
   * accepted: lines/currency are read-only (the API refuses changes). Moving
   * the status off accepted in the form unlocks them for a revision.
   */
  protected readonly clientAccepted = computed(() => {
    const q = this.current();
    return (
      !!q?.respondedAt &&
      q.status === 'accepted' &&
      this.model().status === 'accepted'
    );
  });

  /** Why the lines are read-only, if they are. */
  protected readonly lockNote = computed(() =>
    this.model().projectId
      ? "Lines are locked: the project's milestones were created from them."
      : this.clientAccepted()
        ? 'Lines are locked: the client accepted this version. Change the status to revise it.'
        : null,
  );

  /** "Ada" out of "Ada <ada@x.com>". */
  protected readonly responder = (q: Quote) =>
    (q.respondedBy ?? '').replace(/\s*<[^>]*>$/, '') || 'The client';

  protected readonly hasMilestones = computed(() =>
    this.model().items.some((it) => it.kind === 'milestone'),
  );

  protected readonly clientMap = computed(() =>
    Object.fromEntries(this.clients().map((c) => [c.id, c])),
  );

  private readonly statusLabels: Record<string, string> = {
    draft: 'Draft',
    sent: 'Sent',
    accepted: 'Accepted',
    declined: 'Declined',
    expired: 'Expired',
  };
  protected readonly statusLabel = (v: string) => this.statusLabels[v] ?? v;
  protected readonly statusFilterLabel = (v: string) =>
    v === 'all' ? 'All statuses' : this.statusLabel(v);
  protected readonly clientLabel = (v: string) => {
    const c = this.clientMap()[v];
    return c ? c.company || c.name : v;
  };

  protected readonly filtered = computed(() => {
    const term = this.query().toLowerCase();
    const status = this.statusFilter();
    const clientMap = this.clientMap();
    return this.quotes()
      .filter(
        (q) =>
          (status === 'all' || q.status === status) &&
          (!term ||
            q.number.toLowerCase().includes(term) ||
            (
              clientMap[q.clientId]?.company ||
              clientMap[q.clientId]?.name ||
              ''
            )
              .toLowerCase()
              .includes(term)),
      )
      .slice()
      .sort((a, b) => (a.issueDate < b.issueDate ? 1 : -1));
  });

  protected readonly totals = computed(() => quoteTotal(this.model()));

  /** Retention held across the milestone invoices (released on the last one). */
  protected readonly retentionHeld = computed(() => {
    const m = this.model();
    const held = milestoneSchedule(m.items)
      .slice(0, -1)
      .reduce((s, it) => s + it.quantity * it.rate, 0);
    return (held * num(m.retentionPercent)) / 100;
  });

  protected openNew(): void {
    const c = this.clients()[0];
    this.model.set({
      ...emptyQuote(),
      clientId: c?.id ?? '',
      currency: c?.currency ?? 'USD',
      taxRate: this.defaultTaxRate(),
      items: [emptyQuoteLine('milestone')],
    });
    this.isNew = true;
    this.sheetOpen.set(true);
  }

  protected openEdit(q: Quote): void {
    this.model.set({
      id: q.id,
      number: q.number,
      clientId: q.clientId,
      status: q.status,
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
          selected: it.selected,
        })),
      ),
      taxRate: num(q.taxRate),
      retentionPercent: num(q.retentionPercent),
      notes: q.notes ?? '',
      projectId: q.projectId,
    });
    this.isNew = false;
    this.sheetOpen.set(true);
  }

  /** Saves, then (for an accepted quote not yet converted) offers to start the project. */
  protected save(): void {
    const v = this.model();
    if (this.f().invalid() || v.items.length === 0 || this.saving()) return;
    const locked = !!v.projectId || this.clientAccepted();
    const common: UpdateQuoteRequest = {
      number: v.number.trim() || undefined,
      status: v.status,
      issueDate: toApiDate(v.issueDate),
      validUntil: toApiDate(v.validUntil),
      taxRate: num(v.taxRate),
      retentionPercent: num(v.retentionPercent),
      notes: v.notes.trim() || undefined,
      // A converted quote's lines and currency are locked server-side.
      ...(locked
        ? {}
        : {
            currency: v.currency,
            items: v.items.map((it) => ({
              description: it.description,
              quantity: it.quantity,
              rate: it.rate,
              kind: it.kind,
              details:
                it.kind === 'milestone' ? it.details.trim() || undefined : undefined,
              estimatedHours:
                it.kind === 'milestone' ? (it.estimatedHours ?? undefined) : undefined,
              selected: it.kind === 'option' ? it.selected : undefined,
            })),
          }),
    };
    this.saving.set(true);
    const request = this.isNew
      ? this.quotesApi.create({
          ...common,
          clientId: v.clientId,
        } as CreateQuoteRequest)
      : this.quotesApi.update(v.id, common);
    request.subscribe({
      next: (quote) => {
        this.fx.ensure(quote.currency);
        this.saving.set(false);
        this.quotes.update((list) =>
          this.isNew
            ? [quote, ...list]
            : list.map((q) => (q.id === quote.id ? quote : q)),
        );
        this.sheetOpen.set(false);
        if (this.isNew) toast.success('Quote created');
        else toast.success('Quote updated');
        if (quote.status === 'accepted' && !quote.projectId) {
          this.openConvert(quote);
        }
      },
      error: (err) => {
        this.saving.set(false);
        toast.error('Could not save quote', {
          description: apiErrorMessage(err),
        });
      },
    });
  }

  /** Emails the quote (with PDF) to the client and marks it sent. */
  protected sendCurrent(): void {
    if (this.isNew || this.sending()) return;
    this.sending.set(true);
    this.quotesApi.send(this.model().id).subscribe({
      next: (quote) => {
        this.sending.set(false);
        this.quotes.update((list) =>
          list.map((q) => (q.id === quote.id ? quote : q)),
        );
        this.sheetOpen.set(false);
        toast.success('Quote sent', {
          description: `${quote.number} was emailed to the client.`,
        });
      },
      error: (err) => {
        this.sending.set(false);
        toast.error('Could not send quote', {
          description: apiErrorMessage(err),
        });
      },
    });
  }

  protected removeCurrent(): void {
    const id = this.model().id;
    this.quotesApi.delete(id).subscribe({
      next: () => {
        this.quotes.update((list) => list.filter((q) => q.id !== id));
        this.sheetOpen.set(false);
        toast.success('Quote deleted');
      },
      error: (err) =>
        toast.error('Could not delete quote', {
          description: apiErrorMessage(err),
        }),
    });
  }

  protected onClientChange(clientId: string): void {
    const c = this.clients().find((x) => x.id === clientId);
    this.model.update((m) => ({
      ...m,
      clientId,
      currency: c?.currency ?? m.currency,
    }));
  }

  /** Saves the sheet as accepted, which then opens the start-project dialog. */
  protected acceptAndStart(): void {
    this.model.update((m) => ({ ...m, status: 'accepted' }));
    this.save();
  }

  /** Already accepted (by the client or earlier): straight to setting up the project. */
  protected startProject(): void {
    const q = this.readyToStart();
    if (q) this.openConvert(q);
  }

  protected openConvert(quote: Quote): void {
    const ref = this.dialogService.open(ConvertQuoteDialog, {
      contentClass: 'sm:max-w-lg',
      context: {
        quote,
        clientName: this.clientLabel(quote.clientId),
      } satisfies ConvertQuoteDialogContext,
    });
    ref.closed$.subscribe((result) => {
      const done = result as QuoteConversion | undefined;
      if (!done) return;
      this.quotes.update((list) =>
        list.map((q) => (q.id === done.quote.id ? done.quote : q)),
      );
      this.projects.update((list) => [done.project, ...list]);
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

  private defaultTaxRate(): number {
    return this.workspaceTaxRate();
  }

  protected onItemsChange(items: QuoteLineDraft[]): void {
    this.model.update((m) => ({ ...m, items }));
  }

  protected total(q: Quote): number {
    return quoteTotal(q).total;
  }

  protected readonly money = money;
  protected readonly day = isoDay;
}
