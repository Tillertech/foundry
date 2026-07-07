import {
  ChangeDetectionStrategy,
  Component,
  PLATFORM_ID,
  computed,
  inject,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { FormField, form, required } from '@angular/forms/signals';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucidePlus, lucideSearch } from '@ng-icons/lucide';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmInput } from '@spartan-ng/helm/input';
import { HlmSelectImports } from '@spartan-ng/helm/select';
import { HlmTextarea } from '@spartan-ng/helm/textarea';
import { apiErrorMessage } from '../../core/http';
import { ApiClient, ClientsApiService } from '../../domains/clients';
import {
  CreateQuoteRequest,
  Quote,
  QuoteStatus,
  QuotesApiService,
  UpdateQuoteRequest,
} from '../../domains/quotes';
import {
  Currency,
  isoDay,
  money,
  newId,
  num,
  quoteTotal,
  toApiDate,
} from '../../domains/shared';
import { ToastService } from '../../core/toast.service';
import { DateField } from '../../shared/date-field';
import { EntitySheet } from '../../shared/entity-sheet';
import { Field } from '../../shared/field';
import { fieldError } from '../../shared/field-error';
import { LineItemDraft, LineItemsEditor } from '../../shared/line-items-editor';
import { ListSkeleton } from '../../shared/list-skeleton';
import { PageHeader } from '../../shared/page-header';
import { StatusBadge } from '../../shared/status-badge';

interface QuoteForm {
  id: string;
  number: string;
  clientId: string;
  status: QuoteStatus;
  issueDate: string;
  validUntil: string;
  currency: Currency;
  items: LineItemDraft[];
  taxRate: number;
  notes: string;
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
  notes: '',
});

@Component({
  selector: 'app-quotes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormField,
    NgIcon,
    HlmButton,
    HlmInput,
    HlmTextarea,
    HlmSelectImports,
    DateField,
    EntitySheet,
    Field,
    LineItemsEditor,
    ListSkeleton,
    PageHeader,
    StatusBadge,
  ],
  providers: [provideIcons({ lucidePlus, lucideSearch })],
  templateUrl: './quotes.html',
})
export class Quotes {
  private readonly quotesApi = inject(QuotesApiService);
  private readonly clientsApi = inject(ClientsApiService);
  private readonly toast = inject(ToastService);

  protected readonly loading = signal(true);
  protected readonly quotes = signal<Quote[]>([]);
  protected readonly clients = signal<ApiClient[]>([]);

  protected readonly query = signal('');
  protected readonly statusFilter = signal('all');
  protected readonly sheetOpen = signal(false);
  protected readonly saving = signal(false);
  protected isNew = true;

  protected readonly model = signal<QuoteForm>(emptyQuote());
  protected readonly f = form(this.model, (p) => {
    required(p.clientId, { message: 'Select a client' });
  });
  protected readonly fieldError = fieldError;

  constructor() {
    if (isPlatformBrowser(inject(PLATFORM_ID))) this.refresh();
  }

  private refresh(): void {
    this.quotesApi.list({ take: 100 }).subscribe({
      next: (res) => {
        this.quotes.set(res.results);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.toast.error('Could not load quotes', apiErrorMessage(err));
      },
    });
    this.clientsApi.list({ take: 100 }).subscribe({
      next: (res) => this.clients.set(res.results),
      error: () => undefined,
    });
  }

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
            (clientMap[q.clientId]?.company || clientMap[q.clientId]?.name || '')
              .toLowerCase()
              .includes(term)),
      )
      .slice()
      .sort((a, b) => (a.issueDate < b.issueDate ? 1 : -1));
  });

  protected get totals() {
    return quoteTotal(this.model());
  }

  protected openNew(): void {
    const c = this.clients()[0];
    this.model.set({
      ...emptyQuote(),
      clientId: c?.id ?? '',
      currency: c?.currency ?? 'USD',
      items: [{ id: newId(), description: '', quantity: 1, rate: 0 }],
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
      items: q.items.map((it) => ({
        id: it.id,
        description: it.description,
        quantity: num(it.quantity),
        rate: num(it.rate),
      })),
      taxRate: num(q.taxRate),
      notes: q.notes ?? '',
    });
    this.isNew = false;
    this.sheetOpen.set(true);
  }

  protected save(): void {
    const v = this.model();
    if (this.f().invalid() || v.items.length === 0 || this.saving()) return;
    const common: UpdateQuoteRequest = {
      number: v.number.trim() || undefined,
      status: v.status,
      issueDate: toApiDate(v.issueDate),
      validUntil: toApiDate(v.validUntil),
      currency: v.currency,
      taxRate: num(v.taxRate),
      notes: v.notes.trim() || undefined,
      items: v.items.map(({ description, quantity, rate }) => ({
        description,
        quantity,
        rate,
      })),
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
        this.saving.set(false);
        this.quotes.update((list) =>
          this.isNew
            ? [quote, ...list]
            : list.map((q) => (q.id === quote.id ? quote : q)),
        );
        this.sheetOpen.set(false);
        if (this.isNew) this.toast.created('Quote');
        else this.toast.updated('Quote');
      },
      error: (err) => {
        this.saving.set(false);
        this.toast.error('Could not save quote', apiErrorMessage(err));
      },
    });
  }

  protected removeCurrent(): void {
    const id = this.model().id;
    this.quotesApi.delete(id).subscribe({
      next: () => {
        this.quotes.update((list) => list.filter((q) => q.id !== id));
        this.sheetOpen.set(false);
        this.toast.deleted('Quote');
      },
      error: (err) =>
        this.toast.error('Could not delete quote', apiErrorMessage(err)),
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

  protected onItemsChange(items: LineItemDraft[]): void {
    this.model.update((m) => ({ ...m, items }));
  }

  protected total(q: Quote): number {
    return quoteTotal(q).total;
  }

  protected readonly money = money;
  protected readonly day = isoDay;
}
