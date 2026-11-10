import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HlmDialogService } from '@spartan-ng/helm/dialog';
import { Quote, QuotesApiService } from '../../domains/quotes';
import { PortalRealtimeService } from '../../domains/realtime';
import { isoDay, money, quoteTotal } from '@foundry/shared-util';
import { EmptyState, StatusBadge } from '@foundry/shared-ui';
import { QuoteDetailDialog } from './quote-detail-dialog';
import { refreshOne } from '../../core/live-list';

/** Same order as the API list: newest first. */
const newestFirst = (a: Quote, b: Quote) =>
  b.createdAt.localeCompare(a.createdAt);

@Component({
  selector: 'app-portal-quotes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EmptyState, StatusBadge],
  templateUrl: './quotes.html',
})
export class Quotes {
  private readonly quotesApi = inject(QuotesApiService);
  private readonly dialogService = inject(HlmDialogService);
  private readonly realtime = inject(PortalRealtimeService);

  /** `?quote=<id>` (from a notification) opens that quote once loaded. */
  readonly quote = input<string>();

  protected readonly isoDay = isoDay;
  protected readonly money = money;
  protected readonly quoteTotal = quoteTotal;

  protected readonly loading = signal(true);
  protected readonly quotes = signal<Quote[]>([]);
  /** Last ids flashed by a live update, for a brief highlight. */
  protected readonly fresh = signal<ReadonlySet<string>>(new Set());
  private openedFromLink: string | null = null;

  constructor() {
    this.load();

    // Workspace edits/sends arrive live: refetch just that quote and swap it
    // in (or drop it once it's deleted or no longer visible).
    this.realtime.quotes$
      .pipe(takeUntilDestroyed(inject(DestroyRef)))
      .subscribe((change) => {
        refreshOne(
          change.quoteId,
          change.removed,
          (id) => this.quotesApi.get(id),
          (update) => this.quotes.update(update),
          newestFirst,
        );
        if (!change.removed) this.flash(change.quoteId);
      });
    // Changes missed while disconnected aren't known item by item.
    this.realtime.reconnected$
      .pipe(takeUntilDestroyed(inject(DestroyRef)))
      .subscribe(() => this.load());

    effect(() => {
      const id = this.quote();
      const match = this.quotes().find((q) => q.id === id);
      if (match && this.openedFromLink !== match.id) {
        this.openedFromLink = match.id;
        this.open(match);
      }
    });
  }

  private load(): void {
    this.quotesApi.list({ take: 100 }).subscribe({
      next: (res) => {
        this.quotes.set(res.results);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  private flash(id: string): void {
    this.fresh.update((s) => new Set(s).add(id));
    setTimeout(
      () =>
        this.fresh.update((s) => {
          const next = new Set(s);
          next.delete(id);
          return next;
        }),
      2500,
    );
  }

  protected open(quote: Quote): void {
    const ref = this.dialogService.open(QuoteDetailDialog, {
      contentClass: 'sm:max-w-xl',
      context: { quote },
    });
    // Answered: show it right away (the live push refreshes the rest).
    ref.closed$.subscribe((result) => {
      const updated = result as Quote | undefined;
      if (updated) {
        this.quotes.update((list) =>
          list.map((q) => (q.id === updated.id ? updated : q)),
        );
      }
    });
  }
}
