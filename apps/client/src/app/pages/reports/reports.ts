import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArrowDownRight,
  lucideArrowUpRight,
  lucideFileText,
  lucideReceipt,
  lucideTrendingUp,
  lucideWallet,
} from '@ng-icons/lucide';
import { StoreService, invoiceTotal, money } from '../../core/store.service';
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
  private readonly store = inject(StoreService);

  protected readonly revenue = computed(() =>
    this.store
      .invoices()
      .filter((i) => i.status === 'paid')
      .reduce((s, i) => s + invoiceTotal(i).total, 0),
  );

  protected readonly paidCount = computed(
    () => this.store.invoices().filter((i) => i.status === 'paid').length,
  );

  protected readonly outstanding = computed(() =>
    this.store
      .invoices()
      .filter((i) => ['sent', 'viewed', 'overdue'].includes(i.status))
      .reduce((s, i) => s + invoiceTotal(i).total, 0),
  );

  protected readonly overdue = computed(() =>
    this.store
      .invoices()
      .filter((i) => i.status === 'overdue')
      .reduce((s, i) => s + invoiceTotal(i).total, 0),
  );

  protected readonly spent = computed(() =>
    this.store.expenses().reduce((s, e) => s + e.amount, 0),
  );

  protected readonly profit = computed(() => this.revenue() - this.spent());

  protected readonly avgInvoice = computed(() =>
    this.store.invoices().length ? this.revenue() / Math.max(1, this.paidCount()) : 0,
  );

  protected readonly collected = computed(() =>
    this.store.payments().reduce((s, p) => s + p.amount, 0),
  );

  protected readonly paymentCount = computed(() => this.store.payments().length);

  protected readonly kpis = computed(() => [
    { label: 'Revenue (paid)', value: money(this.revenue()), icon: 'lucideTrendingUp', trend: '+12.4% MoM' },
    { label: 'Outstanding', value: money(this.outstanding()), icon: 'lucideFileText' },
    { label: 'Overdue', value: money(this.overdue()), icon: 'lucideWallet' },
    { label: 'Total spent', value: money(this.spent()), icon: 'lucideReceipt' },
  ]);

  protected readonly byClient = computed(() => {
    const map: Record<string, number> = {};
    for (const i of this.store.invoices()) {
      map[i.clientId] = (map[i.clientId] || 0) + invoiceTotal(i).total;
    }
    const clients = this.store.clients();
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
    for (const e of this.store.expenses()) map[e.category] = (map[e.category] || 0) + e.amount;
    const rows = Object.entries(map).sort((a, b) => b[1] - a[1]);
    const max = Math.max(1, ...rows.map(([, v]) => v));
    return rows.map(([cat, amt]) => ({ cat, amount: money(amt), pct: (amt / max) * 100 }));
  });

  protected readonly money = money;
}
