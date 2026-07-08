import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormField, form, required } from '@angular/forms/signals';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucidePlus, lucideSearch, lucideSend } from '@ng-icons/lucide';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmInput } from '@spartan-ng/helm/input';
import { HlmSelectImports } from '@spartan-ng/helm/select';
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
import { Workspace, WorkspacesApiService } from '../../domains/workspaces';
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
import { fieldError } from '../../shared/field-error';
import { LineItemDraft, LineItemsEditor } from '../../shared/line-items-editor';
import { ListSkeleton } from '../../shared/list-skeleton';
import { PageHeader } from '../../shared/page-header';
import { ReconciliationTimeline } from '../../shared/reconciliation-timeline';
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
    ReconciliationTimeline,
    StatusBadge,
  ],
  providers: [provideIcons({ lucidePlus, lucideSearch, lucideSend })],
  templateUrl: './invoices.html',
})
export class Invoices {
  private readonly invoicesApi = inject(InvoicesApiService);
  private readonly clientsApi = inject(ClientsApiService);
  private readonly projectsApi = inject(ProjectsApiService);
  private readonly workspacesApi = inject(WorkspacesApiService);
  private readonly toast = inject(ToastService);

  protected readonly loading = signal(true);
  protected readonly invoices = signal<Invoice[]>([]);
  protected readonly clients = signal<ApiClient[]>([]);
  private readonly projects = signal<Project[]>([]);
  /** Default workspace: reminder cadence for the reminder column. */
  protected readonly workspace = signal<Workspace | null>(null);

  protected readonly query = signal('');
  protected readonly statusFilter = signal('all');
  protected readonly clientFilter = signal('all');
  protected readonly sheetOpen = signal(false);
  protected readonly saving = signal(false);
  protected readonly sending = signal(false);
  protected isNew = true;

  protected readonly model = signal<InvoiceForm>(emptyInvoice());
  protected readonly f = form(this.model, (p) => {
    required(p.clientId, { message: 'Select a client' });
  });
  protected readonly fieldError = fieldError;

  constructor() {
    this.refresh();
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
    this.workspacesApi.getDefault().subscribe({
      next: (ws) => this.workspace.set(ws),
      error: () => undefined,
    });
  }

  protected readonly clientMap = computed(() =>
    Object.fromEntries(this.clients().map((c) => [c.id, c])),
  );

  private readonly statusLabels: Record<string, string> = {
    draft: 'Draft',
    sent: 'Sent',
    viewed: 'Viewed',
    partially_paid: 'Partially paid',
    paid: 'Paid',
    overpaid: 'Overpaid',
    overdue: 'Overdue',
    cancelled: 'Cancelled',
  };
  protected readonly statusLabel = (v: string) => this.statusLabels[v] ?? v;
  protected readonly statusFilterLabel = (v: string) =>
    v === 'all' ? 'All statuses' : this.statusLabel(v);
  protected readonly clientLabel = (v: string) => {
    const c = this.clientMap()[v];
    return c ? c.company || c.name : v;
  };
  protected readonly clientFilterLabel = (v: string) =>
    v === 'all' ? 'All clients' : this.clientLabel(v);
  protected readonly projectLabel = (v: string) =>
    v ? (this.projects().find((p) => p.id === v)?.name ?? v) : 'None';

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
            (clientMap[i.clientId]?.company || '')
              .toLowerCase()
              .includes(term)),
      )
      .slice()
      .sort((a, b) => (a.issueDate < b.issueDate ? 1 : -1));
  });

  protected readonly totalOutstanding = computed(() =>
    this.filtered()
      .filter(
        (i) =>
          i.status === 'sent' ||
          i.status === 'viewed' ||
          i.status === 'overdue',
      )
      .reduce((s, i) => s + invoiceTotal(i).total, 0),
  );

  protected get clientProjects() {
    const cid = this.model().clientId;
    return this.projects().filter((p) => !cid || p.clientId === cid);
  }

  protected get totals() {
    return invoiceTotal(this.model());
  }

  protected openNew(): void {
    const c = this.clients()[0];
    this.model.set({
      ...emptyInvoice(),
      clientId: c?.id ?? '',
      currency: c?.currency ?? 'USD',
      items: [{ id: newId(), description: '', quantity: 1, rate: 0 }],
    });
    this.isNew = true;
    this.sheetOpen.set(true);
  }

  protected openEdit(i: Invoice): void {
    this.model.set({
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
    });
    this.isNew = false;
    this.sheetOpen.set(true);
  }

  protected save(): void {
    const v = this.model();
    if (this.f().invalid() || v.items.length === 0 || this.saving()) return;
    const common: UpdateInvoiceRequest = {
      projectId: v.projectId || undefined,
      number: v.number.trim() || undefined,
      status: v.status,
      issueDate: toApiDate(v.issueDate),
      dueDate: toApiDate(v.dueDate),
      currency: v.currency,
      taxRate: num(v.taxRate),
      discount: num(v.discount),
      notes: v.notes.trim() || undefined,
      items: v.items.map(({ description, quantity, rate }) => ({
        description,
        quantity,
        rate,
      })),
    };
    this.saving.set(true);
    const request = this.isNew
      ? this.invoicesApi.create({
          ...common,
          clientId: v.clientId,
        } as CreateInvoiceRequest)
      : this.invoicesApi.update(v.id, common);
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
    this.invoicesApi.send(this.model().id).subscribe({
      next: (invoice) => {
        this.sending.set(false);
        this.invoices.update((list) =>
          list.map((i) => (i.id === invoice.id ? invoice : i)),
        );
        this.sheetOpen.set(false);
        this.toast.success(
          'Invoice sent',
          `${invoice.number} was emailed to the client.`,
        );
      },
      error: (err) => {
        this.sending.set(false);
        this.toast.error('Could not send invoice', apiErrorMessage(err));
      },
    });
  }

  protected removeCurrent(): void {
    const id = this.model().id;
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
    this.model.update((m) => ({
      ...m,
      clientId,
      projectId: '',
      currency: c?.currency ?? m.currency,
    }));
  }

  protected onItemsChange(items: LineItemDraft[]): void {
    this.model.update((m) => ({ ...m, items }));
  }

  protected projectName(id: string | null | undefined): string {
    if (!id) return '';
    return this.projects().find((p) => p.id === id)?.name ?? '';
  }

  protected total(i: Invoice): number {
    return invoiceTotal(i).total;
  }

  /**
   * Next reminder the daily schedule will send for the invoice, mirroring the
   * API rules: reminders start reminderDaysBefore days ahead of the due date
   * and repeat on the same cadence; '' when reminders are off or the invoice
   * no longer owes anything.
   */
  protected nextReminder(i: Invoice): string {
    const ws = this.workspace();
    if (!ws?.remindersEnabled) return '';
    const open = ['sent', 'viewed', 'partially_paid', 'overdue'];
    if (!open.includes(i.status)) return '';
    const days = Math.max(1, ws.reminderDaysBefore) * 864e5;
    const next = i.lastRemindedAt
      ? new Date(i.lastRemindedAt).getTime() + days
      : new Date(i.dueDate).getTime() - days;
    return isoDay(new Date(Math.max(next, Date.now())).toISOString());
  }

  protected lastReminded(i: Invoice): string {
    return i.lastRemindedAt ? isoDay(i.lastRemindedAt) : '';
  }

  protected readonly money = money;
  protected readonly day = isoDay;
}
