import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { injectBrnDialogContext } from '@spartan-ng/brain/dialog';
import { forkJoin } from 'rxjs';
import { ApiClient, ClientsApiService } from '../domains/clients';
import {
  Invoice,
  InvoicesApiService,
  ReconciliationEntry,
} from '../domains/invoices';
import { invoiceTotal, isoDay, money } from '@foundry/shared-util';
import { StatusBadge } from '@foundry/shared-ui';

export interface InvoiceDetailsDialogContext {
  invoiceId: string;
}

@Component({
  selector: 'app-invoice-details-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  imports: [StatusBadge],
  template: `
    @if (loading()) {
      <div class="min-w-[280px] space-y-3 p-1 sm:min-w-105">
        <div class="skeleton-shimmer h-5 w-1/3 rounded-md"></div>
        <div class="skeleton-shimmer h-4 w-1/2 rounded-md"></div>
        <div class="skeleton-shimmer mt-4 h-24 w-full rounded-md"></div>
      </div>
    } @else if (!invoice()) {
      <div
        class="min-w-[280px] p-1 text-sm text-muted-foreground sm:min-w-[420px]"
      >
        This invoice could not be loaded.
      </div>
    } @else {
      <div class="min-w-[280px] space-y-5 p-1 sm:min-w-[460px]">
        <!-- Header -->
        <div class="flex items-start justify-between gap-3 pr-6">
          <div>
            <p
              class="text-[11px] font-medium uppercase tracking-wider text-muted-foreground"
            >
              Invoice
            </p>
            <p class="font-mono text-lg font-semibold">
              {{ invoice()!.number }}
            </p>
          </div>
          <app-status-badge [status]="invoice()!.status" />
        </div>

        <!-- Parties + dates -->
        <div
          class="grid grid-cols-2 gap-4 rounded-lg border border-border bg-muted/30 p-4 text-sm"
        >
          <div>
            <p
              class="text-[11px] font-medium uppercase tracking-wider text-muted-foreground"
            >
              Billed to
            </p>
            <p class="mt-1 font-medium">
              {{ client()?.company || client()?.name || 'Unknown client' }}
            </p>
            @if (client()?.email) {
              <p class="text-xs text-muted-foreground">{{ client()!.email }}</p>
            }
          </div>
          @if (invoice()!.project) {
            <div>
              <p
                class="text-[11px] font-medium uppercase tracking-wider text-muted-foreground"
              >
                Project
              </p>
              <p class="mt-1 font-medium">{{ invoice()!.project!.name }}</p>
            </div>
          }
          <div>
            <p
              class="text-[11px] font-medium uppercase tracking-wider text-muted-foreground"
            >
              Issued
            </p>
            <p class="mt-1">{{ isoDay(invoice()!.issueDate) }}</p>
          </div>
          <div>
            <p
              class="text-[11px] font-medium uppercase tracking-wider text-muted-foreground"
            >
              Due
            </p>
            <p class="mt-1">{{ isoDay(invoice()!.dueDate) }}</p>
          </div>
        </div>

        <!-- Line items: a compact stacked row below sm, the full column
             grid from sm up (currency strings like "KES 1,000.00" need more
             room than a fixed narrow column gives them). -->
        <div class="overflow-hidden rounded-lg border border-border">
          <div
            class="hidden gap-2 border-b border-border bg-muted/40 px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground sm:grid sm:grid-cols-[minmax(0,1fr)_44px_96px_104px]"
          >
            <span>Description</span>
            <span class="text-right">Qty</span>
            <span class="text-right">Rate</span>
            <span class="text-right">Amount</span>
          </div>
          <div class="divide-y divide-border">
            @for (item of invoice()!.items; track item.id) {
              <div
                class="flex flex-col gap-1 px-3 py-2 text-sm sm:grid sm:grid-cols-[minmax(0,1fr)_44px_96px_104px] sm:items-center sm:gap-2"
              >
                <span class="min-w-0 truncate">{{ item.description }}</span>
                <div
                  class="flex items-center justify-between text-xs text-muted-foreground sm:hidden"
                >
                  <span class="tabular-nums"
                    >{{ +item.quantity }} ×
                    {{ money(item.rate, invoice()!.currency) }}</span
                  >
                  <span class="font-medium text-foreground tabular-nums">
                    {{
                      money(+item.quantity * +item.rate, invoice()!.currency)
                    }}
                  </span>
                </div>
                <span class="hidden text-right tabular-nums sm:block">{{
                  +item.quantity
                }}</span>
                <span class="hidden text-right tabular-nums sm:block">{{
                  money(item.rate, invoice()!.currency)
                }}</span>
                <span
                  class="hidden text-right tabular-nums font-medium sm:block"
                >
                  {{ money(+item.quantity * +item.rate, invoice()!.currency) }}
                </span>
              </div>
            }
          </div>
        </div>

        <!-- Totals -->
        <div class="rounded-lg border border-border bg-muted/30 p-4 text-sm">
          <div class="flex justify-between">
            <span class="text-muted-foreground">Subtotal</span>
            <span class="tabular-nums">{{
              money(totals().subtotal, invoice()!.currency)
            }}</span>
          </div>
          @if (totals().discount > 0) {
            <div class="mt-1 flex justify-between">
              <span class="text-muted-foreground">Discount</span>
              <span class="tabular-nums"
                >−{{ money(totals().discount, invoice()!.currency) }}</span
              >
            </div>
          }
          <div class="mt-1 flex justify-between">
            <span class="text-muted-foreground"
              >Tax ({{ invoice()!.taxRate }}%)</span
            >
            <span class="tabular-nums">{{
              money(totals().tax, invoice()!.currency)
            }}</span>
          </div>
          <div
            class="mt-3 flex items-center justify-between border-t border-border pt-3"
          >
            <span class="text-sm font-semibold">Total</span>
            <span class="text-lg font-bold tabular-nums">
              {{ money(totals().total, invoice()!.currency) }}
            </span>
          </div>
          @if (latestEntry(); as e) {
            <div
              class="mt-3 flex items-center justify-between border-t border-dashed border-border pt-3 text-xs"
            >
              <span class="text-muted-foreground">
                {{ +e.invoiceBalance! > 0 ? 'Balance due' : 'Paid in full' }}
              </span>
              <span
                class="tabular-nums font-medium"
                [class]="
                  +e.invoiceBalance! > 0 ? 'text-warning' : 'text-success'
                "
              >
                {{ money(e.invoiceBalance!, invoice()!.currency) }}
              </span>
            </div>
          }
        </div>

        @if (invoice()!.notes) {
          <p class="text-xs text-muted-foreground">{{ invoice()!.notes }}</p>
        }
      </div>
    }
  `,
})
export class InvoiceDetailsDialog {
  private readonly invoicesApi = inject(InvoicesApiService);
  private readonly clientsApi = inject(ClientsApiService);
  private readonly ctx = injectBrnDialogContext<InvoiceDetailsDialogContext>();

  protected readonly loading = signal(true);
  protected readonly invoice = signal<Invoice | null>(null);
  protected readonly client = signal<ApiClient | null>(null);
  /** Most recent timeline entry, for the current balance - null when nothing has been paid yet. */
  protected readonly latestEntry = signal<ReconciliationEntry | null>(null);

  protected readonly totals = signal({
    subtotal: 0,
    discount: 0,
    tax: 0,
    total: 0,
  });

  constructor() {
    this.invoicesApi.get(this.ctx.invoiceId).subscribe({
      next: (invoice) => {
        this.invoice.set(invoice);
        this.totals.set(invoiceTotal(invoice));
        forkJoin({
          client: this.clientsApi.get(invoice.clientId),
          timeline: this.invoicesApi.timeline(invoice.id, { take: 1 }),
        }).subscribe({
          next: ({ client, timeline }) => {
            this.client.set(client);
            this.latestEntry.set(timeline.results[0] ?? null);
            this.loading.set(false);
          },
          error: () => this.loading.set(false),
        });
      },
      error: () => this.loading.set(false),
    });
  }

  protected readonly money = money;
  protected readonly isoDay = isoDay;
}
