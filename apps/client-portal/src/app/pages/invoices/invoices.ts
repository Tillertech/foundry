import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmDialogService } from '@spartan-ng/helm/dialog';
import { Invoice, InvoicesApiService } from '../../domains/invoices';
import { invoiceTotal, isoDay, money } from '@foundry/shared-util';
import { EmptyState, StatusBadge } from '@foundry/shared-ui';
import { InvoiceDetailDialog } from './invoice-detail-dialog';

@Component({
  selector: 'app-portal-invoices',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HlmButton, EmptyState, StatusBadge],
  templateUrl: './invoices.html',
})
export class Invoices {
  private readonly invoicesApi = inject(InvoicesApiService);
  private readonly dialogService = inject(HlmDialogService);

  protected readonly isoDay = isoDay;
  protected readonly money = money;
  protected readonly invoiceTotal = invoiceTotal;

  protected readonly loading = signal(true);
  protected readonly invoices = signal<Invoice[]>([]);

  constructor() {
    this.invoicesApi.list({ take: 100 }).subscribe({
      next: (res) => {
        this.invoices.set(res.results);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  protected open(invoice: Invoice): void {
    this.dialogService.open(InvoiceDetailDialog, {
      contentClass: 'sm:max-w-xl',
      context: { invoice },
    });
  }
}
