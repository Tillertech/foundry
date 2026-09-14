import { ChangeDetectionStrategy, Component, computed } from '@angular/core';
import { injectBrnDialogContext } from '@spartan-ng/brain/dialog';
import { HlmDialogImports } from '@spartan-ng/helm/dialog';
import { HlmSeparator } from '@spartan-ng/helm/separator';
import { Quote } from '../../domains/quotes';
import { isoDay, money, num, quoteTotal } from '@foundry/shared-util';
import { StatusBadge } from '@foundry/shared-ui';

export interface QuoteDetailDialogContext {
  quote: Quote;
}

@Component({
  selector: 'app-quote-detail-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HlmDialogImports, HlmSeparator, StatusBadge],
  template: `
    <div hlmDialogHeader>
      <div class="flex items-center gap-3 pr-6">
        <h3 hlmDialogTitle class="font-mono text-base">{{ quote.number }}</h3>
        <app-status-badge [status]="quote.status" />
      </div>
      <p hlmDialogDescription>
        Issued {{ isoDay(quote.issueDate) }} · Valid until
        {{ isoDay(quote.validUntil) }}
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
          @for (item of quote.items; track item.id) {
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
                {{ money(item.rate, quote.currency) }}
              </td>
              <td class="px-3 py-2.5 text-right font-medium tabular-nums">
                {{ money(num(item.quantity) * num(item.rate), quote.currency) }}
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
          money(totals().subtotal, quote.currency)
        }}</span>
      </div>
      @if (num(quote.taxRate) > 0) {
        <div class="flex justify-between text-muted-foreground">
          <span>Tax ({{ quote.taxRate }}%)</span
          ><span class="tabular-nums">{{
            money(totals().tax, quote.currency)
          }}</span>
        </div>
      }
      <hr hlmSeparator />
      <div class="flex justify-between font-semibold">
        <span>Total</span
        ><span class="tabular-nums">{{
          money(totals().total, quote.currency)
        }}</span>
      </div>
    </div>

    @if (quote.notes) {
      <p
        class="rounded-lg bg-muted/60 px-3 py-2 text-xs leading-relaxed text-muted-foreground"
      >
        {{ quote.notes }}
      </p>
    }
  `,
})
export class QuoteDetailDialog {
  protected readonly ctx = injectBrnDialogContext<QuoteDetailDialogContext>();

  protected readonly isoDay = isoDay;
  protected readonly money = money;
  protected readonly num = num;

  protected readonly quote = this.ctx.quote;
  protected readonly totals = computed(() => quoteTotal(this.quote));
}
