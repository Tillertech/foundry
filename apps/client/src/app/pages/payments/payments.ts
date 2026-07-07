import {
  ChangeDetectionStrategy,
  Component,
  PLATFORM_ID,
  computed,
  inject,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { FormField, form, min, required } from '@angular/forms/signals';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucidePlus, lucideSearch, lucideWallet } from '@ng-icons/lucide';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmInput } from '@spartan-ng/helm/input';
import { HlmSelectImports } from '@spartan-ng/helm/select';
import { HlmTextarea } from '@spartan-ng/helm/textarea';
import { apiErrorMessage } from '../../core/http';
import { ApiClient, ClientsApiService } from '../../domains/clients';
import { Invoice, InvoicesApiService } from '../../domains/invoices';
import {
  CreatePaymentRequest,
  Payment,
  PaymentMethod,
  PaymentsApiService,
  UpdatePaymentRequest,
} from '../../domains/payments';
import { Currency, isoDay, money, num, toApiDate } from '../../domains/shared';
import { ToastService } from '../../core/toast.service';
import { DateField } from '../../shared/date-field';
import { EntitySheet } from '../../shared/entity-sheet';
import { Field } from '../../shared/field';
import { fieldError } from '../../shared/field-error';
import { ListSkeleton } from '../../shared/list-skeleton';
import { PageHeader } from '../../shared/page-header';

interface PaymentForm {
  id: string;
  clientId: string;
  invoiceId: string;
  amount: number;
  currency: Currency;
  method: PaymentMethod;
  reference: string;
  date: string;
  notes: string;
}

const emptyPayment = (): PaymentForm => ({
  id: '',
  clientId: '',
  invoiceId: '',
  amount: 0,
  currency: 'USD',
  method: 'bank_transfer',
  reference: '',
  date: new Date().toISOString().slice(0, 10),
  notes: '',
});

export const methodLabels: Record<PaymentMethod, string> = {
  card: 'Card',
  bank_transfer: 'Bank transfer',
  stripe: 'Stripe',
  paypal: 'PayPal',
  cash: 'Cash',
  mobile_money: 'Mobile money',
  other: 'Other',
};

@Component({
  selector: 'app-payments',
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
    ListSkeleton,
    PageHeader,
  ],
  providers: [provideIcons({ lucidePlus, lucideSearch, lucideWallet })],
  templateUrl: './payments.html',
})
export class Payments {
  private readonly paymentsApi = inject(PaymentsApiService);
  private readonly clientsApi = inject(ClientsApiService);
  private readonly invoicesApi = inject(InvoicesApiService);
  private readonly toast = inject(ToastService);

  protected readonly loading = signal(true);
  protected readonly payments = signal<Payment[]>([]);
  protected readonly clients = signal<ApiClient[]>([]);
  private readonly invoices = signal<Invoice[]>([]);

  protected readonly query = signal('');
  protected readonly methodFilter = signal('all');
  protected readonly sheetOpen = signal(false);
  protected readonly saving = signal(false);
  protected isNew = true;

  protected readonly model = signal<PaymentForm>(emptyPayment());
  protected readonly f = form(this.model, (p) => {
    required(p.clientId, { message: 'Select a client' });
    min(p.amount, 0.01, { message: 'Amount must be greater than 0' });
  });
  protected readonly fieldError = fieldError;

  protected readonly methodOptions = Object.entries(methodLabels) as [
    PaymentMethod,
    string,
  ][];

  protected readonly methodFilterLabel = (v: string) =>
    v === 'all' ? 'All methods' : (methodLabels[v as PaymentMethod] ?? v);
  protected readonly methodLabel = (v: string) =>
    methodLabels[v as PaymentMethod] ?? v;
  protected readonly clientLabel = (v: string) => {
    const c = this.clients().find((x) => x.id === v);
    return c ? c.company || c.name : v;
  };
  protected readonly invoiceLabel = (v: string) =>
    v ? (this.invoices().find((i) => i.id === v)?.number ?? v) : 'Unlinked';

  constructor() {
    if (isPlatformBrowser(inject(PLATFORM_ID))) this.refresh();
  }

  private refresh(): void {
    this.paymentsApi.list({ take: 100 }).subscribe({
      next: (res) => {
        this.payments.set(res.results);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.toast.error('Could not load payments', apiErrorMessage(err));
      },
    });
    this.clientsApi.list({ take: 100 }).subscribe({
      next: (res) => this.clients.set(res.results),
      error: () => undefined,
    });
    this.invoicesApi.list({ take: 100 }).subscribe({
      next: (res) => this.invoices.set(res.results),
      error: () => undefined,
    });
  }

  protected readonly clientMap = computed(() =>
    Object.fromEntries(this.clients().map((c) => [c.id, c])),
  );

  protected readonly filtered = computed(() => {
    const term = this.query().toLowerCase();
    const method = this.methodFilter();
    const clientMap = this.clientMap();
    return this.payments()
      .filter(
        (p) =>
          (method === 'all' || p.method === method) &&
          (!term ||
            (p.reference || '').toLowerCase().includes(term) ||
            (clientMap[p.clientId]?.name || '').toLowerCase().includes(term) ||
            (clientMap[p.clientId]?.company || '').toLowerCase().includes(term)),
      )
      .slice()
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  });

  protected readonly total = computed(() =>
    this.filtered().reduce((s, p) => s + num(p.amount), 0),
  );

  protected get clientInvoices() {
    const cid = this.model().clientId;
    return this.invoices().filter((i) => !cid || i.clientId === cid);
  }

  protected openNew(): void {
    this.model.set({ ...emptyPayment(), clientId: this.clients()[0]?.id ?? '' });
    this.isNew = true;
    this.sheetOpen.set(true);
  }

  protected openEdit(p: Payment): void {
    this.model.set({
      id: p.id,
      clientId: p.clientId,
      invoiceId: p.invoiceId ?? '',
      amount: num(p.amount),
      currency: p.currency,
      method: p.method,
      reference: p.reference ?? '',
      date: isoDay(p.date),
      notes: p.notes ?? '',
    });
    this.isNew = false;
    this.sheetOpen.set(true);
  }

  protected save(): void {
    if (this.f().invalid() || this.saving()) return;
    const v = this.model();
    const common: UpdatePaymentRequest = {
      invoiceId: v.invoiceId || undefined,
      amount: num(v.amount),
      currency: v.currency,
      method: v.method,
      reference: v.reference.trim() || undefined,
      date: toApiDate(v.date),
      notes: v.notes.trim() || undefined,
    };
    this.saving.set(true);
    const request = this.isNew
      ? this.paymentsApi.create({
          ...common,
          clientId: v.clientId,
        } as CreatePaymentRequest)
      : this.paymentsApi.update(v.id, common);
    request.subscribe({
      next: (payment) => {
        this.saving.set(false);
        this.payments.update((list) =>
          this.isNew
            ? [payment, ...list]
            : list.map((p) => (p.id === payment.id ? payment : p)),
        );
        this.sheetOpen.set(false);
        if (this.isNew) this.toast.created('Payment');
        else this.toast.updated('Payment');
      },
      error: (err) => {
        this.saving.set(false);
        this.toast.error('Could not save payment', apiErrorMessage(err));
      },
    });
  }

  protected removeCurrent(): void {
    const id = this.model().id;
    this.paymentsApi.delete(id).subscribe({
      next: () => {
        this.payments.update((list) => list.filter((p) => p.id !== id));
        this.sheetOpen.set(false);
        this.toast.deleted('Payment');
      },
      error: (err) =>
        this.toast.error('Could not delete payment', apiErrorMessage(err)),
    });
  }

  protected onClientChange(clientId: string): void {
    this.model.update((m) => ({ ...m, clientId, invoiceId: '' }));
  }

  protected invoiceNumber(id: string | null | undefined): string {
    if (!id) return '';
    return this.invoices().find((i) => i.id === id)?.number ?? '';
  }

  protected label(method: PaymentMethod): string {
    return methodLabels[method];
  }

  protected readonly money = money;
  protected readonly day = isoDay;
}
