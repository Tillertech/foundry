import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideWallet } from '@ng-icons/lucide';
import { Payment, PaymentsApiService } from '../../domains/payments';
import { isoDay, money, num } from '@foundry/shared-util';
import { PortalAuthService } from '../../domains/auth';
import { EmptyState } from '@foundry/shared-ui';
import { PaymentTable, paymentMethodLabel } from '../../shared/payment-table';
import { ANY, FilterOption, ListFilters } from '../../shared/list-filters';

@Component({
  selector: 'app-portal-payments',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgIcon, EmptyState, PaymentTable, ListFilters],
  providers: [provideIcons({ lucideWallet })],
  templateUrl: './payments.html',
})
export class Payments {
  private readonly paymentsApi = inject(PaymentsApiService);
  private readonly auth = inject(PortalAuthService);

  protected readonly isoDay = isoDay;
  protected readonly money = money;

  protected readonly loading = signal(true);
  private readonly rawPayments = signal<Payment[]>([]);

  protected readonly payments = computed(() =>
    this.rawPayments()
      .slice()
      .sort((a, b) => (b.date < a.date ? -1 : 1)),
  );

  protected readonly totalPaid = computed(() =>
    this.payments().reduce((s, p) => s + num(p.amount), 0),
  );
  protected readonly currency = computed(
    () => this.payments()[0]?.currency ?? this.auth.currency(),
  );

  /** Filters, applied server-side (ANY / '' = unfiltered). Payments have no status; method is what tells them apart. */
  protected readonly method = signal<string>(ANY);
  protected readonly projectId = signal('');
  protected readonly filtering = computed(
    () => this.method() !== ANY || !!this.projectId(),
  );
  protected readonly methodOptions: FilterOption[] = Object.entries(
    paymentMethodLabel,
  ).map(([value, label]) => ({ value, label }));

  private loadSeq = 0;

  protected load(): void {
    // Only the latest filter's answer counts.
    const seq = ++this.loadSeq;
    this.paymentsApi
      .list({
        take: 100,
        ...(this.method() !== ANY ? { method: this.method() } : {}),
        ...(this.projectId() ? { projectId: this.projectId() } : {}),
      })
      .subscribe({
        next: (res) => {
          if (seq !== this.loadSeq) return;
          this.rawPayments.set(res.results);
          this.loading.set(false);
        },
        error: () => {
          if (seq === this.loadSeq) this.loading.set(false);
        },
      });
  }

  constructor() {
    this.load();
  }

}
