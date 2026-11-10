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
import { PaymentTable } from '../../shared/payment-table';

@Component({
  selector: 'app-portal-payments',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgIcon, EmptyState, PaymentTable],
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

  constructor() {
    this.paymentsApi.list({ take: 100 }).subscribe({
      next: (res) => {
        this.rawPayments.set(res.results);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

}
