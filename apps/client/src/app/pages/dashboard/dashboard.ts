import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';

import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArrowDownRight,
  lucideArrowUpRight,
  lucideCircleDollarSign,
  lucideFilePlus2,
  lucidePlus,
  lucideSparkles,
  lucideUserPlus,
} from '@ng-icons/lucide';
import { RouterLink } from '@angular/router';
import { HlmButton } from '@spartan-ng/helm/button';
import { AuthService } from '../../domains/auth';
import { ApiClient, ClientsApiService } from '../../domains/clients';
import { Expense, ExpensesApiService } from '../../domains/expenses';
import { Invoice, InvoicesApiService } from '../../domains/invoices';
import { Payment, PaymentsApiService } from '../../domains/payments';
import { invoiceTotal, isoDay, money, num } from '../../domains/shared';
import { StatusBadge } from '../../shared/status-badge';
import { RevenueChart } from './revenue-chart';

const methodLabels: Record<string, string> = {
  card: 'Card',
  bank_transfer: 'Bank transfer',
  stripe: 'Stripe',
  paypal: 'PayPal',
  cash: 'Cash',
  mobile_money: 'Mobile money',
  other: 'Other',
};

const OPEN_STATUSES = ['sent', 'viewed', 'overdue'];

@Component({
  selector: 'app-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgIcon, HlmButton, RouterLink, StatusBadge, RevenueChart],
  providers: [
    provideIcons({
      lucideArrowDownRight,
      lucideArrowUpRight,
      lucideCircleDollarSign,
      lucideFilePlus2,
      lucidePlus,
      lucideSparkles,
      lucideUserPlus,
    }),
  ],
  templateUrl: './dashboard.html',
})
export class Dashboard {
  protected readonly auth = inject(AuthService);
  private readonly invoicesApi = inject(InvoicesApiService);
  private readonly paymentsApi = inject(PaymentsApiService);
  private readonly clientsApi = inject(ClientsApiService);
  private readonly expensesApi = inject(ExpensesApiService);

  private readonly invoices = signal<Invoice[]>([]);
  private readonly payments = signal<Payment[]>([]);
  private readonly clients = signal<ApiClient[]>([]);
  private readonly expenses = signal<Expense[]>([]);

  constructor() {
    this.invoicesApi.list({ take: 100 }).subscribe({
      next: (r) => this.invoices.set(r.results),
      error: () => undefined,
    });
    this.paymentsApi.list({ take: 100 }).subscribe({
      next: (r) => this.payments.set(r.results),
      error: () => undefined,
    });
    this.clientsApi.list({ take: 100 }).subscribe({
      next: (r) => this.clients.set(r.results),
      error: () => undefined,
    });
    this.expensesApi.list({ take: 100 }).subscribe({
      next: (r) => this.expenses.set(r.results),
      error: () => undefined,
    });
  }

  protected readonly today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  protected readonly firstName = computed(
    () => (this.auth.user()?.name || 'there').split(' ')[0],
  );

  protected readonly dueThisWeek = computed(() => {
    const now = Date.now();
    const week = now + 7 * 864e5;
    return this.invoices().filter((i) => {
      if (!OPEN_STATUSES.includes(i.status)) return false;
      const due = new Date(i.dueDate).getTime();
      return due >= now && due <= week;
    }).length;
  });

  protected readonly overdueCount = computed(
    () => this.invoices().filter((i) => i.status === 'overdue').length,
  );

  protected readonly kpis = computed(() => {
    const invoices = this.invoices();
    const open = invoices.filter((i) => OPEN_STATUSES.includes(i.status));
    const overdue = invoices.filter((i) => i.status === 'overdue');
    const paid = invoices.filter((i) => i.status === 'paid');
    const collected = this.payments().reduce((s, p) => s + num(p.amount), 0);
    return [
      {
        label: 'Revenue (paid)',
        value: money(paid.reduce((s, i) => s + invoiceTotal(i).total, 0)),
        delta: `${paid.length} invoices`,
        trend: 'up' as const,
        hint: 'All time',
      },
      {
        label: 'Outstanding',
        value: money(open.reduce((s, i) => s + invoiceTotal(i).total, 0)),
        delta: `${open.length} invoices`,
        trend: 'neutral' as const,
        hint: 'Awaiting payment',
      },
      {
        label: 'Overdue',
        value: money(overdue.reduce((s, i) => s + invoiceTotal(i).total, 0)),
        delta: `${overdue.length} invoices`,
        trend: overdue.length ? ('down' as const) : ('neutral' as const),
        hint: 'Needs follow-up',
      },
      {
        label: 'Collected',
        value: money(collected),
        delta: `${this.payments().length} payments`,
        trend: 'up' as const,
        hint: 'All time',
      },
    ];
  });

  /** Last 12 months of collected payments vs recorded expenses. */
  protected readonly chart = computed(() => {
    const months: { key: string; label: string }[] = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        label: d.toLocaleDateString('en-US', { month: 'short' }),
      });
    }
    const revenue = new Map(months.map((m) => [m.key, 0]));
    const expenses = new Map(months.map((m) => [m.key, 0]));
    for (const p of this.payments()) {
      const key = isoDay(p.date).slice(0, 7);
      if (revenue.has(key))
        revenue.set(key, (revenue.get(key) || 0) + num(p.amount));
    }
    for (const e of this.expenses()) {
      const key = isoDay(e.date).slice(0, 7);
      if (expenses.has(key))
        expenses.set(key, (expenses.get(key) || 0) + num(e.amount));
    }
    return {
      months: months.map((m) => m.label),
      revenue: months.map((m) => Math.round(revenue.get(m.key) || 0)),
      expenses: months.map((m) => Math.round(expenses.get(m.key) || 0)),
    };
  });

  protected readonly upcomingInvoices = computed(() => {
    const now = Date.now();
    const horizon = now + 10 * 864e5;
    const clients = this.clients();
    return this.invoices()
      .filter((i) => {
        if (!OPEN_STATUSES.includes(i.status)) return false;
        const due = new Date(i.dueDate).getTime();
        return due <= horizon;
      })
      .slice()
      .sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1))
      .slice(0, 5)
      .map((i) => {
        const client = clients.find((c) => c.id === i.clientId);
        return {
          id: i.id,
          number: i.number,
          client: client?.company || client?.name || '—',
          due: isoDay(i.dueDate).slice(5),
          amount: money(invoiceTotal(i).total, i.currency),
        };
      });
  });

  protected readonly recentInvoices = computed(() => {
    const clients = this.clients();
    return this.invoices()
      .slice()
      .sort((a, b) => (a.issueDate < b.issueDate ? 1 : -1))
      .slice(0, 5)
      .map((inv) => {
        const client = clients.find((c) => c.id === inv.clientId);
        return {
          id: inv.id,
          number: inv.number,
          client: client?.company || client?.name || '—',
          due: inv.status === 'draft' ? '—' : isoDay(inv.dueDate).slice(5),
          status: inv.status,
          amount: money(invoiceTotal(inv).total, inv.currency),
        };
      });
  });

  protected readonly recentPayments = computed(() => {
    const clients = this.clients();
    return this.payments()
      .slice()
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .slice(0, 4)
      .map((p) => {
        const client = clients.find((c) => c.id === p.clientId);
        return {
          id: p.id,
          client: client?.company || client?.name || '—',
          method: methodLabels[p.method] ?? p.method,
          when: isoDay(p.date),
          amount: money(num(p.amount), p.currency),
        };
      });
  });

  protected initials(name: string): string {
    return name
      .split(' ')
      .map((s) => s[0])
      .slice(0, 2)
      .join('');
  }
}
