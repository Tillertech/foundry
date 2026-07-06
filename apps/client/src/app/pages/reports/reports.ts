import {
  ChangeDetectionStrategy,
  Component,
  PLATFORM_ID,
  computed,
  inject,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArrowDownRight,
  lucideArrowUpRight,
  lucideFileText,
  lucideReceipt,
  lucideTrendingUp,
  lucideWallet,
} from '@ng-icons/lucide';
import { ApiClient, ClientsApiService } from '../../domains/clients';
import { Expense, ExpensesApiService } from '../../domains/expenses';
import { Invoice, InvoicesApiService } from '../../domains/invoices';
import { Payment, PaymentsApiService } from '../../domains/payments';
import { invoiceTotal, money, num } from '../../domains/shared';
import { PageHeader } from '../../shared/page-header';

@Component({
  selector: 'app-reports',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgIcon, PageHeader],
  providers: [
    provideIcons({
      lucideArrowDownRight,
      lucideArrowUpRight,
      lucideFileText,
      lucideReceipt,
      lucideTrendingUp,
      lucideWallet,
    }),
  ],
  templateUrl: './reports.html',
})
export class Reports {
  private readonly invoicesApi = inject(InvoicesApiService);
  private readonly expensesApi = inject(ExpensesApiService);
  private readonly paymentsApi = inject(PaymentsApiService);
  private readonly clientsApi = inject(ClientsApiService);

  private readonly invoices = signal<Invoice[]>([]);
  private readonly expenses = signal<Expense[]>([]);
  private readonly payments = signal<Payment[]>([]);
  private readonly clients = signal<ApiClient[]>([]);

  constructor() {
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      this.invoicesApi
        .list({ take: 100 })
        .subscribe({ next: (r) => this.invoices.set(r.results), error: () => undefined });
      this.expensesApi
        .list({ take: 100 })
        .subscribe({ next: (r) => this.expenses.set(r.results), error: () => undefined });
      this.paymentsApi
        .list({ take: 100 })
        .subscribe({ next: (r) => this.payments.set(r.results), error: () => undefined });
      this.clientsApi
        .list({ take: 100 })
        .subscribe({ next: (r) => this.clients.set(r.results), error: () => undefined });
    }
  }

  protected readonly revenue = computed(() =>
    this.invoices()
      .filter((i) => i.status === 'paid')
      .reduce((s, i) => s + invoiceTotal(i).total, 0),
  );

  protected readonly paidCount = computed(
    () => this.invoices().filter((i) => i.status === 'paid').length,
  );

  protected readonly outstanding = computed(() =>
    this.invoices()
      .filter((i) => ['sent', 'viewed', 'overdue'].includes(i.status))
      .reduce((s, i) => s + invoiceTotal(i).total, 0),
  );

  protected readonly overdue = computed(() =>
    this.invoices()
      .filter((i) => i.status === 'overdue')
      .reduce((s, i) => s + invoiceTotal(i).total, 0),
  );

  protected readonly spent = computed(() =>
    this.expenses().reduce((s, e) => s + num(e.amount), 0),
  );

  protected readonly profit = computed(() => this.revenue() - this.spent());

  protected readonly avgInvoice = computed(() =>
    this.invoices().length ? this.revenue() / Math.max(1, this.paidCount()) : 0,
  );

  protected readonly collected = computed(() =>
    this.payments().reduce((s, p) => s + num(p.amount), 0),
  );

  protected readonly paymentCount = computed(() => this.payments().length);

  protected readonly kpis = computed(() => [
    { label: 'Revenue (paid)', value: money(this.revenue()), icon: 'lucideTrendingUp', trend: `${this.paidCount()} paid invoices` },
    { label: 'Outstanding', value: money(this.outstanding()), icon: 'lucideFileText' },
    { label: 'Overdue', value: money(this.overdue()), icon: 'lucideWallet' },
    { label: 'Total spent', value: money(this.spent()), icon: 'lucideReceipt' },
  ]);

  protected readonly byClient = computed(() => {
    const map: Record<string, number> = {};
    for (const i of this.invoices()) {
      map[i.clientId] = (map[i.clientId] || 0) + invoiceTotal(i).total;
    }
    const clients = this.clients();
    const rows = Object.entries(map)
      .flatMap(([id, total]) => {
        const client = clients.find((c) => c.id === id);
        return client ? [{ client, total }] : [];
      })
      .sort((a, b) => b.total - a.total)
      .slice(0, 6);
    const max = rows[0]?.total || 1;
    return rows.map((r) => ({
      id: r.client.id,
      name: r.client.company || r.client.name,
      amount: money(r.total, r.client.currency),
      pct: (r.total / max) * 100,
    }));
  });

  protected readonly expByCat = computed(() => {
    const map: Record<string, number> = {};
    for (const e of this.expenses()) {
      map[e.category] = (map[e.category] || 0) + num(e.amount);
    }
    const rows = Object.entries(map).sort((a, b) => b[1] - a[1]);
    const max = Math.max(1, ...rows.map(([, v]) => v));
    return rows.map(([cat, amt]) => ({ cat, amount: money(amt), pct: (amt / max) * 100 }));
  });

  protected readonly money = money;
}
