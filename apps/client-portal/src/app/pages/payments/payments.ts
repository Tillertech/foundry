import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideDownload, lucideWallet } from '@ng-icons/lucide';
import { HlmButton } from '@spartan-ng/helm/button';
import { InvoicesApiService } from '../../domains/invoices';
import { Payment, PaymentsApiService } from '../../domains/payments';
import { isoDay, money, num } from '@foundry/shared-util';
import { saveBlob } from '../../core/download-file';
import { EmptyState } from '@foundry/shared-ui';

const methodLabel: Record<string, string> = {
  card: 'Card',
  bank_transfer: 'Bank transfer',
  stripe: 'Stripe',
  paypal: 'PayPal',
  cash: 'Cash',
  mobile_money: 'Mobile money',
  other: 'Other',
};

@Component({
  selector: 'app-portal-payments',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgIcon, HlmButton, EmptyState],
  providers: [provideIcons({ lucideDownload, lucideWallet })],
  templateUrl: './payments.html',
})
export class Payments {
  private readonly paymentsApi = inject(PaymentsApiService);
  private readonly invoicesApi = inject(InvoicesApiService);

  protected readonly isoDay = isoDay;
  protected readonly money = money;
  protected readonly methodLabel = methodLabel;

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
    () => this.payments()[0]?.currency ?? 'USD',
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

  protected downloadReceipt(payment: Payment): void {
    if (!payment.invoiceId) return;
    this.invoicesApi.download(payment.invoiceId).subscribe((blob) => {
      saveBlob(blob, `receipt-${payment.id}.pdf`);
    });
  }
}
