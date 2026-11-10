import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideDownload, lucideFileText, lucideFolderKanban } from '@ng-icons/lucide';
import { HlmButton } from '@spartan-ng/helm/button';
import { isoDay, money } from '@foundry/shared-util';
import { PortalAuthService } from '../domains/auth';
import { InvoicesApiService } from '../domains/invoices';
import { Payment } from '../domains/payments';
import { saveBlob } from '../core/download-file';

export const paymentMethodLabel: Record<string, string> = {
  card: 'Card',
  bank_transfer: 'Bank transfer',
  stripe: 'Stripe',
  paypal: 'PayPal',
  cash: 'Cash',
  mobile_money: 'Mobile money',
  other: 'Other',
};

/**
 * Payment rows with what each one paid for: the invoice (opens it) and that
 * invoice's project (opens the project), so nobody has to match references
 * by hand.
 */
@Component({
  selector: 'app-payment-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  imports: [RouterLink, NgIcon, HlmButton],
  providers: [provideIcons({ lucideDownload, lucideFileText, lucideFolderKanban })],
  template: `
    <div class="surface-card overflow-x-auto">
      <table class="w-full min-w-[640px] text-sm">
        <thead>
          <tr class="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground">
            <th class="px-4 py-2.5 font-medium">Date</th>
            <th class="px-4 py-2.5 font-medium">Paid for</th>
            <th class="px-4 py-2.5 font-medium">Method</th>
            <th class="px-4 py-2.5 text-right font-medium">Amount</th>
            <th class="px-4 py-2.5"></th>
          </tr>
        </thead>
        <tbody>
          @for (p of payments(); track p.id) {
            <tr class="border-b border-border/50 last:border-0">
              <td class="px-4 py-3 text-muted-foreground">{{ isoDay(p.date) }}</td>
              <td class="px-4 py-3">
                @if (p.invoice; as inv) {
                  <a
                    [routerLink]="[base(), 'invoices']"
                    [queryParams]="{ invoice: inv.id }"
                    class="inline-flex items-center gap-1 font-mono text-xs font-semibold hover:text-primary hover:underline"
                  >
                    <ng-icon name="lucideFileText" size="12" class="shrink-0" />
                    {{ inv.number }}
                  </a>
                  @if (showProject() && p.project; as proj) {
                    <a
                      [routerLink]="[base(), 'projects', proj.id]"
                      class="mt-0.5 flex max-w-[240px] items-center gap-1 truncate text-[11px] text-muted-foreground hover:text-primary hover:underline"
                    >
                      <ng-icon name="lucideFolderKanban" size="11" class="shrink-0" />
                      <span class="truncate">{{ proj.name }}</span>
                    </a>
                  }
                } @else {
                  <span class="text-xs text-muted-foreground">On account</span>
                }
                @if (p.reference) {
                  <span class="mt-0.5 block font-mono text-[11px] text-muted-foreground">Ref {{ p.reference }}</span>
                }
              </td>
              <td class="px-4 py-3 text-muted-foreground">
                {{ methodLabel[p.method] ?? p.method }}
              </td>
              <td class="px-4 py-3 text-right font-medium tabular-nums">
                {{ money(p.amount, p.currency) }}
              </td>
              <td class="px-4 py-3 text-right">
                @if (p.invoice) {
                  <button
                    hlmBtn
                    variant="ghost"
                    size="sm"
                    type="button"
                    class="h-7 gap-1.5 text-xs"
                    (click)="downloadInvoice(p)"
                    [attr.aria-label]="'Download ' + p.invoice.number"
                  >
                    <ng-icon name="lucideDownload" size="12" /> Invoice
                  </button>
                }
              </td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
})
export class PaymentTable {
  private readonly auth = inject(PortalAuthService);
  private readonly invoicesApi = inject(InvoicesApiService);

  readonly payments = input.required<ReadonlyArray<Payment>>();
  /** Off inside a project's own tab. */
  readonly showProject = input(true);

  protected readonly base = computed(() => `/${this.auth.slug() ?? ''}`);
  protected readonly isoDay = isoDay;
  protected readonly money = money;
  protected readonly methodLabel = paymentMethodLabel;

  /** The paid invoice's PDF (there's no separate receipt document). */
  protected downloadInvoice(p: Payment): void {
    if (!p.invoice) return;
    const number = p.invoice.number;
    this.invoicesApi.download(p.invoice.id).subscribe((blob) => {
      saveBlob(blob, `${number}.pdf`);
    });
  }
}
