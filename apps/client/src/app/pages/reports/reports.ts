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
  lucideBanknote,
  lucideFileText,
  lucideReceipt,
  lucideTrendingUp,
  lucideWallet,
} from '@ng-icons/lucide';
import { HlmSelectImports } from '@spartan-ng/helm/select';
import { apiErrorMessage } from '../../core/http';
import { ToastService } from '../../core/toast.service';
import { ReportSummary, ReportsApiService } from '../../domains/reports';
import { money } from '../../domains/shared';
import { ListSkeleton } from '../../shared/list-skeleton';
import { PageHeader } from '../../shared/page-header';
import { CashflowChart } from './cashflow-chart';

type PeriodId =
  | 'this_month'
  | 'last_3_months'
  | 'this_year'
  | 'last_12_months'
  | 'all';

interface Period {
  id: PeriodId;
  label: string;
  from?: () => string;
}

const day = (d: Date) => d.toISOString().slice(0, 10);

const PERIODS: Period[] = [
  {
    id: 'this_month',
    label: 'This month',
    from: () => day(new Date(new Date().getFullYear(), new Date().getMonth(), 1)),
  },
  {
    id: 'last_3_months',
    label: 'Last 3 months',
    from: () => day(new Date(Date.now() - 91 * 864e5)),
  },
  {
    id: 'this_year',
    label: 'This year',
    from: () => day(new Date(new Date().getFullYear(), 0, 1)),
  },
  {
    id: 'last_12_months',
    label: 'Last 12 months',
    from: () => day(new Date(Date.now() - 365 * 864e5)),
  },
  { id: 'all', label: 'All time' },
];

@Component({
  selector: 'app-reports',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgIcon, PageHeader, ListSkeleton, HlmSelectImports, CashflowChart],
  providers: [
    provideIcons({
      lucideArrowDownRight,
      lucideArrowUpRight,
      lucideBanknote,
      lucideFileText,
      lucideReceipt,
      lucideTrendingUp,
      lucideWallet,
    }),
  ],
  templateUrl: './reports.html',
})
export class Reports {
  private readonly reportsApi = inject(ReportsApiService);
  private readonly toast = inject(ToastService);

  protected readonly periods = PERIODS;
  protected readonly period = signal<PeriodId>('this_year');
  protected readonly loading = signal(true);
  protected readonly summary = signal<ReportSummary | null>(null);

  constructor() {
    this.load();
  }

  protected onPeriodChange(id: string | null | undefined): void {
    this.period.set((id as PeriodId) ?? 'this_year');
    this.load();
  }

  protected readonly periodLabel = (id: string) =>
    PERIODS.find((p) => p.id === id)?.label ?? id;

  private load(): void {
    const preset = PERIODS.find((p) => p.id === this.period());
    this.loading.set(true);
    this.reportsApi
      .summary({
        from: preset?.from?.(),
        to: preset?.from ? day(new Date()) : undefined,
      })
      .subscribe({
        next: (summary) => {
          this.summary.set(summary);
          this.loading.set(false);
        },
        error: (err) => {
          this.loading.set(false);
          this.toast.error('Could not load reports', apiErrorMessage(err));
        },
      });
  }

  /** Workspace currency - every headline figure is expressed in it. */
  protected readonly currency = computed(
    () => this.summary()?.currency ?? 'USD',
  );

  protected readonly kpis = computed(() => {
    const s = this.summary();
    if (!s) return [];
    return [
      {
        label: 'Collected',
        value: money(s.collected, s.currency),
        icon: 'lucideTrendingUp',
        trend: `${s.paymentCount} payments`,
      },
      {
        label: 'Outstanding',
        value: money(s.outstanding, s.currency),
        icon: 'lucideFileText',
        trend: `${s.invoiceCount} invoices in period`,
      },
      {
        label: 'Overdue',
        value: money(s.overdue, s.currency),
        icon: 'lucideWallet',
      },
      {
        label: 'Net profit',
        value: money(s.netProfit, s.currency),
        icon: 'lucideBanknote',
        negative: s.netProfit < 0,
        trend: `${money(s.expenses, s.currency)} spent`,
      },
    ];
  });

  protected readonly months = computed(
    () => this.summary()?.monthly.map((m) => m.month) ?? [],
  );
  protected readonly monthlyCollected = computed(
    () => this.summary()?.monthly.map((m) => m.collected) ?? [],
  );
  protected readonly monthlyExpenses = computed(
    () => this.summary()?.monthly.map((m) => m.expenses) ?? [],
  );

  protected readonly topClients = computed(() => {
    const s = this.summary();
    if (!s) return [];
    const max = s.topClients[0]?.invoiced || 1;
    return s.topClients.map((c) => ({
      ...c,
      invoicedLabel: money(c.invoiced, s.currency),
      collectedLabel: money(c.collected, s.currency),
      pct: (c.invoiced / max) * 100,
    }));
  });

  protected readonly expenseCategories = computed(() => {
    const s = this.summary();
    if (!s) return [];
    const max = s.expensesByCategory[0]?.amount || 1;
    return s.expensesByCategory.map((c) => ({
      ...c,
      amountLabel: money(c.amount, s.currency),
      pct: (c.amount / max) * 100,
    }));
  });

  /**
   * Payments grouped by the currency the customer paid with; the converted
   * workspace-currency figure leads (workspace takes precedence) and the
   * original paid-currency amount rides along.
   */
  protected readonly paymentCurrencies = computed(() => {
    const s = this.summary();
    if (!s) return [];
    return s.paymentsByCurrency.map((row) => ({
      ...row,
      convertedLabel: money(row.converted, s.currency),
      originalLabel: money(row.amount, row.currency),
      sameCurrency: row.currency === s.currency,
    }));
  });

  protected readonly statusCounts = computed(
    () => this.summary()?.invoicesByStatus ?? [],
  );

  protected statusText(status: string): string {
    return status.replace(/_/g, ' ');
  }

  protected readonly money = money;
}
