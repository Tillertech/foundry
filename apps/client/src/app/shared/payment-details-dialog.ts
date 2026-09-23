import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { injectBrnDialogContext } from '@spartan-ng/brain/dialog';
import { HlmDialogService } from '@spartan-ng/helm/dialog';
import { forkJoin, of } from 'rxjs';
import { ApiClient, ClientsApiService } from '../domains/clients';
import { Invoice, InvoicesApiService } from '../domains/invoices';
import { Payment, PaymentMethod, PaymentsApiService } from '../domains/payments';
import { isoDay, money } from '@foundry/shared-util';
import { InvoiceDetailsDialog } from './invoice-details-dialog';

export interface PaymentDetailsDialogContext {
  paymentId: string;
}

const methodLabels: Record<PaymentMethod, string> = {
  card: 'Card',
  bank_transfer: 'Bank transfer',
  stripe: 'Stripe',
  paypal: 'PayPal',
  cash: 'Cash',
  mobile_money: 'Mobile money',
  other: 'Other',
};

@Component({
  selector: 'app-payment-details-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (loading()) {
      <div class="min-w-[280px] space-y-3 p-1 sm:min-w-105">
        <div class="skeleton-shimmer h-5 w-1/3 rounded-md"></div>
        <div class="skeleton-shimmer h-4 w-1/2 rounded-md"></div>
        <div class="skeleton-shimmer mt-4 h-24 w-full rounded-md"></div>
      </div>
    } @else if (!payment()) {
      <div class="min-w-[280px] p-1 text-sm text-muted-foreground sm:min-w-105">
        This payment could not be loaded.
      </div>
    } @else {
      <div class="min-w-[280px] space-y-5 p-1 sm:min-w-105">
        <!-- Header -->
        <div class="flex items-start justify-between gap-3 pr-6">
          <div>
            <p
              class="text-[11px] font-medium uppercase tracking-wider text-muted-foreground"
            >
              Payment
            </p>
            <p class="text-lg font-semibold tabular-nums">
              {{ money(payment()!.amount, payment()!.currency) }}
            </p>
          </div>
          <span
            class="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary"
          >
            {{ methodLabels[payment()!.method] }}
          </span>
        </div>

        <!-- Details -->
        <div
          class="grid grid-cols-2 gap-4 rounded-lg border border-border bg-muted/30 p-4 text-sm"
        >
          <div>
            <p
              class="text-[11px] font-medium uppercase tracking-wider text-muted-foreground"
            >
              Paid by
            </p>
            <p class="mt-1 font-medium">
              {{ client()?.company || client()?.name || 'Unknown client' }}
            </p>
            @if (client()?.email) {
              <p class="text-xs text-muted-foreground">{{ client()!.email }}</p>
            }
          </div>
          <div>
            <p
              class="text-[11px] font-medium uppercase tracking-wider text-muted-foreground"
            >
              Date
            </p>
            <p class="mt-1">{{ isoDay(payment()!.date) }}</p>
          </div>
          @if (payment()!.reference) {
            <div>
              <p
                class="text-[11px] font-medium uppercase tracking-wider text-muted-foreground"
              >
                Reference
              </p>
              <p class="mt-1 font-mono text-xs">{{ payment()!.reference }}</p>
            </div>
          }
          @if (invoice(); as inv) {
            <div>
              <p
                class="text-[11px] font-medium uppercase tracking-wider text-muted-foreground"
              >
                Applied to
              </p>
              <button
                type="button"
                (click)="openInvoice()"
                class="mt-1 inline-flex rounded-full bg-primary/10 px-2 py-0.5 font-mono text-[11px] font-medium text-primary transition-colors hover:bg-primary/20"
              >
                {{ inv.number }}
              </button>
            </div>
          }
        </div>

        @if (payment()!.notes) {
          <p class="text-xs text-muted-foreground">{{ payment()!.notes }}</p>
        }
      </div>
    }
  `,
})
export class PaymentDetailsDialog {
  private readonly paymentsApi = inject(PaymentsApiService);
  private readonly clientsApi = inject(ClientsApiService);
  private readonly invoicesApi = inject(InvoicesApiService);
  private readonly dialogService = inject(HlmDialogService);
  private readonly ctx = injectBrnDialogContext<PaymentDetailsDialogContext>();

  protected readonly loading = signal(true);
  protected readonly payment = signal<Payment | null>(null);
  protected readonly client = signal<ApiClient | null>(null);
  protected readonly invoice = signal<Invoice | null>(null);

  constructor() {
    this.paymentsApi.get(this.ctx.paymentId).subscribe({
      next: (payment) => {
        this.payment.set(payment);
        forkJoin({
          client: this.clientsApi.get(payment.clientId),
          invoice: payment.invoiceId
            ? this.invoicesApi.get(payment.invoiceId)
            : of(null),
        }).subscribe({
          next: ({ client, invoice }) => {
            this.client.set(client);
            this.invoice.set(invoice);
            this.loading.set(false);
          },
          error: () => this.loading.set(false),
        });
      },
      error: () => this.loading.set(false),
    });
  }

  protected openInvoice(): void {
    const inv = this.invoice();
    if (!inv) return;
    this.dialogService.open(InvoiceDetailsDialog, {
      contentClass: 'sm:max-w-lg',
      context: { invoiceId: inv.id },
    });
  }

  protected readonly methodLabels = methodLabels;
  protected readonly money = money;
  protected readonly isoDay = isoDay;
}
