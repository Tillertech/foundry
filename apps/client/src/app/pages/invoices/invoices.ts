import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormField, form, required } from '@angular/forms/signals';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucidePlus,
  lucideReceipt,
  lucideSearch,
  lucideSend,
} from '@ng-icons/lucide';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmCheckboxImports } from '@spartan-ng/helm/checkbox';
import { HlmInput } from '@spartan-ng/helm/input';
import { HlmSelectImports } from '@spartan-ng/helm/select';
import { HlmTextarea } from '@spartan-ng/helm/textarea';
import {
  apiErrorMessage,
  Currency,
  humanize,
  invoiceTotal,
  isoDay,
  money,
  newId,
  num,
  toApiDate,
} from '@foundry/shared-util';
import { ApiClient, ClientsApiService } from '../../domains/clients';
import { Expense, ExpensesApiService } from '../../domains/expenses';
import {
  CreateInvoiceRequest,
  Invoice,
  InvoiceStatus,
  InvoicesApiService,
  UpdateInvoiceRequest,
} from '../../domains/invoices';
import { Project, ProjectsApiService } from '../../domains/projects';
import { Workspace, WorkspacesApiService } from '../../domains/workspaces';
import { DateField } from '../../shared/date-field';
import { EntitySheet } from '../../shared/entity-sheet';
import { Field, fieldError, PageHeader, StatusBadge, ToastService } from '@foundry/shared-ui';
import { LineItemDraft, LineItemsEditor } from '../../shared/line-items-editor';
import { ListSkeleton } from '../../shared/list-skeleton';
import { ReconciliationTimeline } from '../../shared/reconciliation-timeline';

/** A billable expense re-billed on the invoice, kept apart from the editable lines. */
interface ExpenseLineDraft {
  expenseId: string;
  description: string;
  amount: number;
  currency: Currency;
  date: string;
}

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
  expenseLines: ExpenseLineDraft[];
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
  expenseLines: [],
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
    HlmCheckboxImports,
    Field,
    LineItemsEditor,
    ListSkeleton,
    PageHeader,
    ReconciliationTimeline,
    StatusBadge,
  ],
  providers: [
    provideIcons({ lucidePlus, lucideReceipt, lucideSearch, lucideSend }),
  ],
  templateUrl: './invoices.html',
})
export class Invoices {
  private readonly invoicesApi = inject(InvoicesApiService);
  private readonly clientsApi = inject(ClientsApiService);
  private readonly projectsApi = inject(ProjectsApiService);
  private readonly workspacesApi = inject(WorkspacesApiService);
  private readonly expensesApi = inject(ExpensesApiService);
  private readonly toast = inject(ToastService);

  protected readonly loading = signal(true);
  protected readonly invoices = signal<Invoice[]>([]);
  protected readonly clients = signal<ApiClient[]>([]);
  private readonly projects = signal<Project[]>([]);
  /** The selected client's billable expenses, for the sheet's expense picker. */
  private readonly clientExpenses = signal<Expense[]>([]);
  protected readonly expensesLoading = signal(false);
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
    return invoiceTotal({ ...this.model(), items: this.allLines() });
  }

  /** Regular lines plus re-billed expenses (1 x amount) - what the API totals over. */
  private allLines() {
    const m = this.model();
    return [
      ...m.items,
      ...m.expenseLines.map((e) => ({ quantity: 1, rate: e.amount })),
    ];
  }

  /**
   * Expenses the picker offers: the client's billable ones not yet billed
   * elsewhere (the invoice being edited keeps its own), plus any already on
   * this invoice that the list didn't return.
   */
  protected readonly billableExpenses = computed(() => {
    const m = this.model();
    const available: ExpenseLineDraft[] = this.clientExpenses()
      .filter((e) => !e.invoiceItem || e.invoiceItem.invoice.id === m.id)
      .map((e) => this.toExpenseLine(e));
    const listed = new Set(available.map((e) => e.expenseId));
    return [
      ...m.expenseLines.filter((e) => !listed.has(e.expenseId)),
      ...available,
    ];
  });

  protected readonly expensesTotal = computed(() =>
    this.model().expenseLines.reduce((sum, e) => sum + e.amount, 0),
  );

  protected isExpenseSelected(expenseId: string): boolean {
    return this.model().expenseLines.some((e) => e.expenseId === expenseId);
  }

  protected toggleExpense(line: ExpenseLineDraft, checked: boolean): void {
    this.model.update((m) => ({
      ...m,
      expenseLines: checked
        ? [...m.expenseLines, line]
        : m.expenseLines.filter((e) => e.expenseId !== line.expenseId),
    }));
  }

  private toExpenseLine(e: Expense): ExpenseLineDraft {
    return {
      expenseId: e.id,
      description: `${e.vendor} · ${humanize(e.category)}`,
      amount: num(e.amount),
      currency: e.currency,
      date: isoDay(e.date),
    };
  }

  private loadClientExpenses(clientId: string): void {
    this.clientExpenses.set([]);
    if (!clientId) return;
    this.expensesLoading.set(true);
    this.expensesApi.list({ clientId, billable: true, take: 100 }).subscribe({
      next: (res) => {
        // Ignore a late response for a client the sheet has since moved off.
        if (this.model().clientId !== clientId) return;
        this.clientExpenses.set(res.results);
        this.expensesLoading.set(false);
      },
      error: () => this.expensesLoading.set(false),
    });
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
    this.loadClientExpenses(c?.id ?? '');
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
      items: i.items
        .filter((it) => !it.expenseId)
        .map((it) => ({
          id: it.id,
          description: it.description,
          quantity: num(it.quantity),
          rate: num(it.rate),
        })),
      expenseLines: i.items.flatMap((it) =>
        it.expenseId
          ? [
              {
                expenseId: it.expenseId,
                description: it.description,
                amount: num(it.quantity) * num(it.rate),
                currency: i.currency,
                date: it.expense ? isoDay(it.expense.date) : '',
              },
            ]
          : [],
      ),
      taxRate: num(i.taxRate),
      discount: num(i.discount),
      notes: i.notes ?? '',
    });
    this.isNew = false;
    this.loadClientExpenses(i.clientId);
    this.sheetOpen.set(true);
  }

  protected save(): void {
    const v = this.model();
    const lineCount = v.items.length + v.expenseLines.length;
    if (this.f().invalid() || lineCount === 0 || this.saving()) return;
    const mismatched = v.expenseLines.find((e) => e.currency !== v.currency);
    if (mismatched) {
      this.toast.error(
        'Expense currency mismatch',
        `${mismatched.description} is in ${mismatched.currency} - untick it or switch the invoice to ${mismatched.currency}.`,
      );
      return;
    }
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
      items: [
        ...v.items.map(({ description, quantity, rate }) => ({
          description,
          quantity,
          rate,
        })),
        ...v.expenseLines.map(({ expenseId, description, amount }) => ({
          description,
          quantity: 1,
          rate: amount,
          expenseId,
        })),
      ],
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
        // Billed-on markers moved - reload so the picker reflects them.
        this.loadClientExpenses(invoice.clientId);
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
      // Expenses belong to one client's projects - never carry them across.
      expenseLines: clientId === m.clientId ? m.expenseLines : [],
    }));
    this.loadClientExpenses(clientId);
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
