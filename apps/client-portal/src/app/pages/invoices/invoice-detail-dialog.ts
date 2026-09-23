import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideDownload, lucideReceipt } from '@ng-icons/lucide';
import { injectBrnDialogContext } from '@spartan-ng/brain/dialog';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmDialogImports } from '@spartan-ng/helm/dialog';
import { HlmSeparator } from '@spartan-ng/helm/separator';
import {
  Invoice,
  InvoiceItem,
  InvoicesApiService,
} from '../../domains/invoices';
import {
  humanize,
  invoiceTotal,
  isoDay,
  money,
  num,
} from '@foundry/shared-util';
import { saveBlob } from '../../core/download-file';
import { StatusBadge } from '@foundry/shared-ui';

export interface InvoiceDetailDialogContext {
  invoice: Invoice;
}

@Component({
  selector: 'app-invoice-detail-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgIcon, HlmDialogImports, HlmButton, HlmSeparator, StatusBadge],
  providers: [provideIcons({ lucideDownload, lucideReceipt })],
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

    @if (services().length > 0) {
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
            @for (item of services(); track item.id) {
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
                  {{ money(lineAmount(item), invoice.currency) }}
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }

    @if (expenses().length > 0) {
      <section aria-labelledby="billable-expenses-heading">
        <div class="my-4 flex items-end justify-between gap-3">
          <div>
            <h4
              id="billable-expenses-heading"
              class="text-sm font-semibold"
            >
              Billable expenses
            </h4>
            <p class="text-xs text-muted-foreground">
              Costs incurred on your behalf, billed at cost.
            </p>
          </div>
          <span
            class="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
          >
            {{ expenses().length }}
            {{ expenses().length === 1 ? 'expense' : 'expenses' }}
          </span>
        </div>
        <ul class="divide-y divide-border rounded-lg border border-border">
          @for (item of expenses(); track item.id) {
            <li class="flex items-center gap-3 px-3 py-2.5">
              <div
                class="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-primary/10 text-primary"
                aria-hidden="true"
              >
                <ng-icon name="lucideReceipt" size="14" />
              </div>
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-medium">
                  {{ item.expense?.vendor || item.description }}
                </p>
                @if (item.expense) {
                  <p class="text-xs text-muted-foreground">
                    {{ humanize(item.expense.category) }} ·
                    {{ isoDay(item.expense.date) }}
                  </p>
                }
              </div>
              <span class="text-sm font-medium tabular-nums">{{
                money(lineAmount(item), invoice.currency)
              }}</span>
            </li>
          }
        </ul>
      </section>
    }

    <div class="ml-auto w-56 space-y-1 text-sm">
      @if (expenses().length > 0) {
        <div class="flex justify-between text-muted-foreground">
          <span>Services</span
          ><span class="tabular-nums">{{
            money(servicesTotal(), invoice.currency)
          }}</span>
        </div>
        <div class="flex justify-between text-muted-foreground">
          <span>Billable expenses</span
          ><span class="tabular-nums">{{
            money(expensesTotal(), invoice.currency)
          }}</span>
        </div>
      }
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
  protected readonly humanize = humanize;

  protected readonly invoice = this.ctx.invoice;
  protected readonly totals = computed(() => invoiceTotal(this.invoice));

  /** Billed work, and the re-billed expenses shown as their own section. */
  protected readonly services = computed(() =>
    this.invoice.items.filter((it) => !it.expenseId),
  );
  protected readonly expenses = computed(() =>
    this.invoice.items.filter((it) => it.expenseId),
  );
  protected readonly servicesTotal = computed(() =>
    this.services().reduce((sum, it) => sum + this.lineAmount(it), 0),
  );
  protected readonly expensesTotal = computed(() =>
    this.expenses().reduce((sum, it) => sum + this.lineAmount(it), 0),
  );

  protected lineAmount(item: InvoiceItem): number {
    return num(item.quantity) * num(item.rate);
  }

  protected download(): void {
    this.invoicesApi.download(this.invoice.id).subscribe((blob) => {
      saveBlob(blob, `${this.invoice.number}.pdf`);
    });
  }
}
