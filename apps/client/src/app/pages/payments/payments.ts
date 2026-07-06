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
import { lucidePlus, lucideSearch, lucideWallet } from '@ng-icons/lucide';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmInput } from '@spartan-ng/helm/input';
import { HlmNativeSelectImports } from '@spartan-ng/helm/native-select';
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
    FormsModule,
    NgIcon,
    HlmButton,
    HlmInput,
    HlmTextarea,
    HlmNativeSelectImports,
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
  protected form: PaymentForm = emptyPayment();

  protected readonly methodOptions = Object.entries(methodLabels) as [
    PaymentMethod,
    string,
  ][];

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
    return this.invoices().filter(
      (i) => !this.form.clientId || i.clientId === this.form.clientId,
    );
  }

  protected openNew(): void {
    this.form = { ...emptyPayment(), clientId: this.clients()[0]?.id ?? '' };
    this.isNew = true;
    this.sheetOpen.set(true);
  }

  protected openEdit(p: Payment): void {
    this.form = {
      id: p.id,
      clientId: p.clientId,
      invoiceId: p.invoiceId ?? '',
      amount: num(p.amount),
      currency: p.currency,
      method: p.method,
      reference: p.reference ?? '',
      date: isoDay(p.date),
      notes: p.notes ?? '',
    };
    this.isNew = false;
    this.sheetOpen.set(true);
  }

  protected save(): void {
    if (!this.form.clientId || this.form.amount <= 0 || this.saving()) return;
    const common: UpdatePaymentRequest = {
      invoiceId: this.form.invoiceId || undefined,
      amount: num(this.form.amount),
      currency: this.form.currency,
      method: this.form.method,
      reference: this.form.reference.trim() || undefined,
      date: toApiDate(this.form.date),
      notes: this.form.notes.trim() || undefined,
    };
    this.saving.set(true);
    const request = this.isNew
      ? this.paymentsApi.create({
          ...common,
          clientId: this.form.clientId,
        } as CreatePaymentRequest)
      : this.paymentsApi.update(this.form.id, common);
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
    const id = this.form.id;
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
    this.form.clientId = clientId;
    this.form.invoiceId = '';
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
