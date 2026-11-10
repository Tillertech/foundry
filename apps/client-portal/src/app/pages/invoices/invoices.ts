import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { HlmDialogService } from '@spartan-ng/helm/dialog';
import { Invoice, InvoicesApiService } from '../../domains/invoices';
import { Currency, isoDay, money } from '@foundry/shared-util';
import { EmptyState } from '@foundry/shared-ui';
import { InvoiceTable } from '../../shared/invoice-table';
import { ANY, FilterOption, ListFilters } from '../../shared/list-filters';
import { InvoiceDetailDialog } from './invoice-detail-dialog';

@Component({
  selector: 'app-portal-invoices',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EmptyState, InvoiceTable, ListFilters],
  templateUrl: './invoices.html',
})
export class Invoices {
  private readonly invoicesApi = inject(InvoicesApiService);
  private readonly dialogService = inject(HlmDialogService);

  /** `?invoice=<id>` (from a notification) opens that invoice once loaded. */
  readonly invoice = input<string>();
  private openedFromLink: string | null = null;

  protected readonly isoDay = isoDay;
  protected readonly money = money;
  /** What's still to pay, per currency (usually just one). */
  protected readonly owed = computed(() => {
    const by = new Map<Currency, { due: number; overdue: number }>();
    for (const inv of this.invoices()) {
      if (inv.status === 'cancelled' || inv.balanceDue <= 0) continue;
      const row = by.get(inv.currency) ?? { due: 0, overdue: 0 };
      row.due += inv.balanceDue;
      if (inv.status === 'overdue') row.overdue += inv.balanceDue;
      by.set(inv.currency, row);
    }
    return [...by.entries()].map(([currency, v]) => ({ currency, ...v }));
  });

  protected readonly loading = signal(true);
  protected readonly invoices = signal<Invoice[]>([]);

  /** Filters, applied server-side (ANY / '' = unfiltered). */
  protected readonly status = signal<string>(ANY);
  protected readonly projectId = signal('');
  protected readonly filtering = computed(
    () => this.status() !== ANY || !!this.projectId(),
  );
  protected readonly statusOptions: FilterOption[] = [
    { value: 'sent', label: 'Sent' },
    { value: 'viewed', label: 'Viewed' },
    { value: 'partially_paid', label: 'Partially paid' },
    { value: 'overdue', label: 'Overdue' },
    { value: 'paid', label: 'Paid' },
    { value: 'overpaid', label: 'Overpaid' },
    { value: 'cancelled', label: 'Cancelled' },
  ];

  private loadSeq = 0;

  protected load(): void {
    // Only the latest filter's answer counts.
    const seq = ++this.loadSeq;
    this.invoicesApi
      .list({
        take: 100,
        ...(this.status() !== ANY ? { status: this.status() } : {}),
        ...(this.projectId() ? { projectId: this.projectId() } : {}),
      })
      .subscribe({
        next: (res) => {
          if (seq !== this.loadSeq) return;
          this.invoices.set(res.results);
          this.loading.set(false);
        },
        error: () => {
          if (seq === this.loadSeq) this.loading.set(false);
        },
      });
  }

  constructor() {
    this.load();

    effect(() => {
      const id = this.invoice();
      const match = this.invoices().find((i) => i.id === id);
      if (match && this.openedFromLink !== match.id) {
        this.openedFromLink = match.id;
        this.open(match);
      }
    });
  }

  protected open(invoice: Invoice): void {
    this.dialogService.open(InvoiceDetailDialog, {
      contentClass: 'sm:max-w-xl',
      context: { invoice },
    });
  }
}
