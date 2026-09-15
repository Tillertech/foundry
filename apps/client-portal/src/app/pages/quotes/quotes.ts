import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { HlmDialogService } from '@spartan-ng/helm/dialog';
import { Quote, QuotesApiService } from '../../domains/quotes';
import { isoDay, money, quoteTotal } from '@foundry/shared-util';
import { EmptyState, StatusBadge } from '@foundry/shared-ui';
import { QuoteDetailDialog } from './quote-detail-dialog';

@Component({
  selector: 'app-portal-quotes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EmptyState, StatusBadge],
  templateUrl: './quotes.html',
})
export class Quotes {
  private readonly quotesApi = inject(QuotesApiService);
  private readonly dialogService = inject(HlmDialogService);

  protected readonly isoDay = isoDay;
  protected readonly money = money;
  protected readonly quoteTotal = quoteTotal;

  protected readonly loading = signal(true);
  protected readonly quotes = signal<Quote[]>([]);

  constructor() {
    this.quotesApi.list({ take: 100 }).subscribe({
      next: (res) => {
        this.quotes.set(res.results);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  protected open(quote: Quote): void {
    this.dialogService.open(QuoteDetailDialog, {
      contentClass: 'sm:max-w-xl',
      context: { quote },
    });
  }
}
