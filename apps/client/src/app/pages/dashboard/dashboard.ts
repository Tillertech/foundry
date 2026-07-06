import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArrowDownRight,
  lucideArrowUpRight,
  lucideCircleDollarSign,
  lucideEllipsis,
  lucideFilePlus2,
  lucidePlus,
  lucideSparkles,
  lucideUserPlus,
} from '@ng-icons/lucide';
import { RouterLink } from '@angular/router';
import { HlmButton } from '@spartan-ng/helm/button';
import { KPIS, upcomingInvoices } from '../../core/mock-data';
import { AuthService } from '../../core/auth.service';
import { StoreService, invoiceTotal, money } from '../../core/store.service';
import { StatusBadge } from '../../shared/status-badge';
import { RevenueChart } from './revenue-chart';

interface Kpi {
  label: string;
  value: number;
  delta: string;
  trend: 'up' | 'down' | 'neutral';
  hint: string;
}

const methodLabels: Record<string, string> = {
  card: 'Card',
  bank_transfer: 'Bank transfer',
  stripe: 'Stripe',
  paypal: 'PayPal',
  cash: 'Cash',
  other: 'Other',
};

@Component({
  selector: 'app-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgIcon, HlmButton, RouterLink, StatusBadge, RevenueChart],
  providers: [
    provideIcons({
      lucideArrowDownRight,
      lucideArrowUpRight,
      lucideCircleDollarSign,
      lucideEllipsis,
      lucideFilePlus2,
      lucidePlus,
      lucideSparkles,
      lucideUserPlus,
    }),
  ],
  templateUrl: './dashboard.html',
})
export class Dashboard {
  private readonly store = inject(StoreService);
  protected readonly auth = inject(AuthService);

  protected readonly today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  protected readonly firstName = computed(
    () => (this.auth.user()?.name || 'Mika').split(' ')[0],
  );

  protected readonly kpis: Kpi[] = [
    { label: "Today's revenue", value: KPIS.todayRevenue, delta: '+12.4%', trend: 'up', hint: 'vs. yesterday' },
    { label: 'Outstanding', value: KPIS.outstanding, delta: '4 invoices', trend: 'neutral', hint: 'Awaiting payment' },
    { label: 'Overdue', value: KPIS.overdue, delta: '1 invoice', trend: 'down', hint: 'Needs follow-up' },
    { label: 'Monthly recurring', value: KPIS.mrr, delta: '+3.1%', trend: 'up', hint: '6 active subscriptions' },
  ];

  protected readonly ranges = ['3M', '6M', '12M', 'All'];
  protected readonly selectedRange = signal('12M');

  protected readonly upcomingInvoices = upcomingInvoices;

  protected readonly recentInvoices = computed(() => {
    const clients = this.store.clients();
    return this.store
      .invoices()
      .slice()
      .sort((a, b) => (a.issueDate < b.issueDate ? 1 : -1))
      .slice(0, 5)
      .map((inv) => {
        const client = clients.find((c) => c.id === inv.clientId);
        return {
          id: inv.id,
          number: inv.number,
          client: client?.company || client?.name || '—',
          due: inv.status === 'draft' ? '—' : inv.dueDate.slice(5),
          status: inv.status,
          amount: money(invoiceTotal(inv).total, inv.currency),
        };
      });
  });

  protected readonly recentPayments = computed(() => {
    const clients = this.store.clients();
    return this.store
      .payments()
      .slice()
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .slice(0, 4)
      .map((p) => {
        const client = clients.find((c) => c.id === p.clientId);
        return {
          id: p.id,
          client: client?.company || client?.name || '—',
          method: methodLabels[p.method] ?? p.method,
          when: p.date,
          amount: money(p.amount, p.currency),
        };
      });
  });

  protected fmt(n: number): string {
    return `$${n.toLocaleString('en-US')}`;
  }

  protected initials(name: string): string {
    return name
      .split(' ')
      .map((s) => s[0])
      .slice(0, 2)
      .join('');
  }
}
