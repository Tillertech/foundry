import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideDownload } from '@ng-icons/lucide';
import { injectBrnDialogContext } from '@spartan-ng/brain/dialog';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmDialogImports } from '@spartan-ng/helm/dialog';
import { HlmSeparator } from '@spartan-ng/helm/separator';
import { Invoice, InvoicesApiService } from '../../domains/invoices';
import { invoiceTotal, isoDay, money, num } from '@foundry/shared-util';
import { saveBlob } from '../../core/download-file';
import { StatusBadge } from '@foundry/shared-ui';

export interface InvoiceDetailDialogContext {
  invoice: Invoice;
}

@Component({
  selector: 'app-invoice-detail-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgIcon, HlmDialogImports, HlmButton, HlmSeparator, StatusBadge],
  providers: [provideIcons({ lucideDownload })],
  template: `
    <div hlmDialogHeader>
      <div class="flex items-center gap-3 pr-6">
        <h3 hlmDialogTitle class="font-mono text-base">{{ invoice.number }}</h3>
        <app-status-badge [status]="invoice.status" />
      </div>
      <p hlmDialogDescription>
        Issued {{ isoDay(invoice.issueDate) }} · Due
        {{ isoDay(invoice.dueDate) }}
      </p>
    </div>

    <div class="overflow-hidden rounded-lg border border-border">
      <table class="w-full text-sm">
        <thead>
          <tr
            class="border-b border-border bg-muted/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground"
          >
            <th class="px-3 py-2 font-medium">Description</th>
            <th class="px-3 py-2 text-right font-medium">Qty</th>
            <th class="px-3 py-2 text-right font-medium">Rate</th>
            <th class="px-3 py-2 text-right font-medium">Amount</th>
          </tr>
        </thead>
        <tbody>
          @for (item of invoice.items; track item.id) {
            <tr class="border-b border-border/50 last:border-0">
              <td class="px-3 py-2.5">{{ item.description }}</td>
              <td
                class="px-3 py-2.5 text-right tabular-nums text-muted-foreground"
              >
                {{ item.quantity }}
              </td>
              <td
                class="px-3 py-2.5 text-right tabular-nums text-muted-foreground"
              >
                {{ money(item.rate, invoice.currency) }}
              </td>
              <td class="px-3 py-2.5 text-right font-medium tabular-nums">
                {{
                  money(num(item.quantity) * num(item.rate), invoice.currency)
                }}
              </td>
            </tr>
          }
        </tbody>
      </table>
    </div>

    <div class="ml-auto w-56 space-y-1 text-sm">
      <div class="flex justify-between text-muted-foreground">
        <span>Subtotal</span
        ><span class="tabular-nums">{{
          money(totals().subtotal, invoice.currency)
        }}</span>
      </div>
      @if (totals().discount > 0) {
        <div class="flex justify-between text-muted-foreground">
          <span>Discount</span
          ><span class="tabular-nums"
            >-{{ money(totals().discount, invoice.currency) }}</span
          >
        </div>
      }
      @if (num(invoice.taxRate) > 0) {
        <div class="flex justify-between text-muted-foreground">
          <span>Tax ({{ invoice.taxRate }}%)</span
          ><span class="tabular-nums">{{
            money(totals().tax, invoice.currency)
          }}</span>
        </div>
      }
      <hr hlmSeparator />
      <div class="flex justify-between font-semibold">
        <span>Total</span
        ><span class="tabular-nums">{{
          money(totals().total, invoice.currency)
        }}</span>
      </div>
    </div>

    <hr hlmSeparator />

    <div class="flex items-center justify-end">
      <button
        hlmBtn
        size="sm"
        type="button"
        class="gap-1.5"
        (click)="download()"
      >
        <ng-icon name="lucideDownload" size="14" /> Download PDF
      </button>
    </div>
  `,
})
export class InvoiceDetailDialog {
  protected readonly ctx = injectBrnDialogContext<InvoiceDetailDialogContext>();
  private readonly invoicesApi = inject(InvoicesApiService);

  protected readonly isoDay = isoDay;
  protected readonly money = money;
  protected readonly num = num;

  protected readonly invoice = this.ctx.invoice;
  protected readonly totals = computed(() => invoiceTotal(this.invoice));

  protected download(): void {
    this.invoicesApi.download(this.invoice.id).subscribe((blob) => {
      saveBlob(blob, `${this.invoice.number}.pdf`);
    });
  }
}
