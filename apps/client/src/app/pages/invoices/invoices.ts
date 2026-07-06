import {
  ChangeDetectionStrategy,
  Component,
  PLATFORM_ID,
  computed,
  inject,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucidePlus, lucideSearch, lucideSend } from '@ng-icons/lucide';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmInput } from '@spartan-ng/helm/input';
import { HlmNativeSelectImports } from '@spartan-ng/helm/native-select';
import { HlmTextarea } from '@spartan-ng/helm/textarea';
import { apiErrorMessage } from '../../core/http';
import { ApiClient, ClientsApiService } from '../../domains/clients';
import {
  CreateInvoiceRequest,
  Invoice,
  InvoiceStatus,
  InvoicesApiService,
  UpdateInvoiceRequest,
} from '../../domains/invoices';
import { Project, ProjectsApiService } from '../../domains/projects';
import {
  Currency,
  invoiceTotal,
  isoDay,
  money,
  newId,
  num,
  toApiDate,
} from '../../domains/shared';
import { ToastService } from '../../core/toast.service';
import { DateField } from '../../shared/date-field';
import { EntitySheet } from '../../shared/entity-sheet';
import { Field } from '../../shared/field';
import { LineItemDraft, LineItemsEditor } from '../../shared/line-items-editor';
import { ListSkeleton } from '../../shared/list-skeleton';
import { PageHeader } from '../../shared/page-header';
import { StatusBadge } from '../../shared/status-badge';

interface InvoiceForm {
  id: string;
  number: string;
  clientId: string;
  projectId: string;
  status: InvoiceStatus;
  issueDate: string;
  dueDate: string;
  currency: Currency;
  items: LineItemDraft[];
  taxRate: number;
  discount: number;
  notes: string;
}

const emptyInvoice = (): InvoiceForm => ({
  id: '',
  number: '',
  clientId: '',
  projectId: '',
  status: 'draft',
  issueDate: new Date().toISOString().slice(0, 10),
  dueDate: new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10),
  currency: 'USD',
  items: [],
  taxRate: 0,
  discount: 0,
  notes: '',
});

@Component({
  selector: 'app-invoices',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    NgIcon,
    HlmButton,
    HlmInput,
    HlmTextarea,
    HlmNativeSelectImports,
    DateField,
    EntitySheet,
    Field,
    LineItemsEditor,
    ListSkeleton,
    PageHeader,
    StatusBadge,
  ],
  providers: [provideIcons({ lucidePlus, lucideSearch, lucideSend })],
  templateUrl: './invoices.html',
})
export class Invoices {
  private readonly invoicesApi = inject(InvoicesApiService);
  private readonly clientsApi = inject(ClientsApiService);
  private readonly projectsApi = inject(ProjectsApiService);
  private readonly toast = inject(ToastService);

  protected readonly loading = signal(true);
  protected readonly invoices = signal<Invoice[]>([]);
  protected readonly clients = signal<ApiClient[]>([]);
  private readonly projects = signal<Project[]>([]);

  protected readonly query = signal('');
  protected readonly statusFilter = signal('all');
  protected readonly clientFilter = signal('all');
  protected readonly sheetOpen = signal(false);
  protected readonly saving = signal(false);
  protected readonly sending = signal(false);
  protected isNew = true;
  protected form: InvoiceForm = emptyInvoice();

  constructor() {
    if (isPlatformBrowser(inject(PLATFORM_ID))) this.refresh();
  }

  private refresh(): void {
    this.invoicesApi.list({ take: 100 }).subscribe({
      next: (res) => {
        this.invoices.set(res.results);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.toast.error('Could not load invoices', apiErrorMessage(err));
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
  }

  protected readonly clientMap = computed(() =>
    Object.fromEntries(this.clients().map((c) => [c.id, c])),
  );

  protected readonly filtered = computed(() => {
    const term = this.query().toLowerCase();
    const status = this.statusFilter();
    const client = this.clientFilter();
    const clientMap = this.clientMap();
    return this.invoices()
      .filter(
        (i) =>
          (status === 'all' || i.status === status) &&
          (client === 'all' || i.clientId === client) &&
          (!term ||
            i.number.toLowerCase().includes(term) ||
            (clientMap[i.clientId]?.name || '').toLowerCase().includes(term) ||
            (clientMap[i.clientId]?.company || '').toLowerCase().includes(term)),
      )
      .slice()
      .sort((a, b) => (a.issueDate < b.issueDate ? 1 : -1));
  });

  protected readonly totalOutstanding = computed(() =>
    this.filtered()
      .filter((i) => i.status === 'sent' || i.status === 'viewed' || i.status === 'overdue')
      .reduce((s, i) => s + invoiceTotal(i).total, 0),
  );

  protected get clientProjects() {
    return this.projects().filter(
      (p) => !this.form.clientId || p.clientId === this.form.clientId,
    );
  }

  protected get totals() {
    return invoiceTotal(this.form);
  }

  protected openNew(): void {
    const c = this.clients()[0];
    this.form = {
      ...emptyInvoice(),
      clientId: c?.id ?? '',
      currency: c?.currency ?? 'USD',
      items: [{ id: newId(), description: '', quantity: 1, rate: 0 }],
    };
    this.isNew = true;
    this.sheetOpen.set(true);
  }

  protected openEdit(i: Invoice): void {
    this.form = {
      id: i.id,
      number: i.number,
      clientId: i.clientId,
      projectId: i.projectId ?? '',
      status: i.status,
      issueDate: isoDay(i.issueDate),
      dueDate: isoDay(i.dueDate),
      currency: i.currency,
      items: i.items.map((it) => ({
        id: it.id,
        description: it.description,
        quantity: num(it.quantity),
        rate: num(it.rate),
      })),
      taxRate: num(i.taxRate),
      discount: num(i.discount),
      notes: i.notes ?? '',
    };
    this.isNew = false;
    this.sheetOpen.set(true);
  }

  protected save(): void {
    if (!this.form.clientId || this.form.items.length === 0 || this.saving()) return;
    const common: UpdateInvoiceRequest = {
      projectId: this.form.projectId || undefined,
      number: this.form.number.trim() || undefined,
      status: this.form.status,
      issueDate: toApiDate(this.form.issueDate),
      dueDate: toApiDate(this.form.dueDate),
      currency: this.form.currency,
      taxRate: num(this.form.taxRate),
      discount: num(this.form.discount),
      notes: this.form.notes.trim() || undefined,
      items: this.form.items.map(({ description, quantity, rate }) => ({
        description,
        quantity,
        rate,
      })),
    };
    this.saving.set(true);
    const request = this.isNew
      ? this.invoicesApi.create({
          ...common,
          clientId: this.form.clientId,
        } as CreateInvoiceRequest)
      : this.invoicesApi.update(this.form.id, common);
    request.subscribe({
      next: (invoice) => {
        this.saving.set(false);
        this.invoices.update((list) =>
          this.isNew
            ? [invoice, ...list]
            : list.map((i) => (i.id === invoice.id ? invoice : i)),
        );
        this.sheetOpen.set(false);
        if (this.isNew) this.toast.created('Invoice');
        else this.toast.updated('Invoice');
      },
      error: (err) => {
        this.saving.set(false);
        this.toast.error('Could not save invoice', apiErrorMessage(err));
      },
    });
  }

  /** Emails the invoice (with PDF) to the client and marks it sent. */
  protected sendCurrent(): void {
    if (this.isNew || this.sending()) return;
    this.sending.set(true);
    this.invoicesApi.send(this.form.id).subscribe({
      next: (invoice) => {
        this.sending.set(false);
        this.invoices.update((list) =>
          list.map((i) => (i.id === invoice.id ? invoice : i)),
        );
        this.sheetOpen.set(false);
        this.toast.success('Invoice sent', `${invoice.number} was emailed to the client.`);
      },
      error: (err) => {
        this.sending.set(false);
        this.toast.error('Could not send invoice', apiErrorMessage(err));
      },
    });
  }

  protected removeCurrent(): void {
    const id = this.form.id;
    this.invoicesApi.delete(id).subscribe({
      next: () => {
        this.invoices.update((list) => list.filter((i) => i.id !== id));
        this.sheetOpen.set(false);
        this.toast.deleted('Invoice');
      },
      error: (err) =>
        this.toast.error('Could not delete invoice', apiErrorMessage(err)),
    });
  }

  protected onClientChange(clientId: string): void {
    const c = this.clients().find((x) => x.id === clientId);
    this.form.clientId = clientId;
    this.form.projectId = '';
    if (c) this.form.currency = c.currency;
  }

  protected onItemsChange(items: LineItemDraft[]): void {
    this.form.items = items;
  }

  protected projectName(id: string | null | undefined): string {
    if (!id) return '';
    return this.projects().find((p) => p.id === id)?.name ?? '';
  }

  protected total(i: Invoice): number {
    return invoiceTotal(i).total;
  }

  protected readonly money = money;
  protected readonly day = isoDay;
}
