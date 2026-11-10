import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideFolderKanban } from '@ng-icons/lucide';
import {
  ListQuotesQuery,
  PortalQuoteStatus,
  Quote,
  QuotesApiService,
} from '../../domains/quotes';
import { PortalRealtimeService } from '../../domains/realtime';
import { isoDay, money, quoteTotal } from '@foundry/shared-util';
import { EmptyState, StatusBadge } from '@foundry/shared-ui';
import { ANY, FilterOption, ListFilters } from '../../shared/list-filters';
import { PortalAuthService } from '../../domains/auth';
import { refreshOne } from '../../core/live-list';

/** Same order as the API list: newest first. */
const newestFirst = (a: Quote, b: Quote) =>
  b.createdAt.localeCompare(a.createdAt);

@Component({
  selector: 'app-portal-quotes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    EmptyState,
    StatusBadge,
    RouterLink,
    NgIcon,
    ListFilters,
  ],
  providers: [provideIcons({ lucideFolderKanban })],
  templateUrl: './quotes.html',
})
export class Quotes {
  private readonly quotesApi = inject(QuotesApiService);
  private readonly router = inject(Router);
  private readonly auth = inject(PortalAuthService);
  private readonly realtime = inject(PortalRealtimeService);

  /** Legacy `?quote=<id>` links land on the quote's own page. */
  readonly quote = input<string>();

  protected readonly isoDay = isoDay;
  protected readonly money = money;
  protected readonly quoteTotal = quoteTotal;

  protected readonly loading = signal(true);
  protected readonly quotes = signal<Quote[]>([]);
  /** Last ids flashed by a live update, for a brief highlight. */
  protected readonly fresh = signal<ReadonlySet<string>>(new Set());
  protected readonly quotesLink = computed(() => `/${this.auth.slug() ?? ''}/quotes`);

  /** Filters, applied server-side (ANY / '' = unfiltered). */
  protected readonly status = signal<string>(ANY);
  protected readonly projectId = signal('');
  protected readonly filtering = computed(
    () => this.status() !== ANY || !!this.projectId(),
  );
  protected readonly statusOptions: FilterOption[] = [
    { value: 'sent', label: 'Awaiting your answer' },
    { value: 'accepted', label: 'Accepted' },
    { value: 'declined', label: 'Declined' },
    { value: 'expired', label: 'Expired' },
  ];

  constructor() {
    this.load();

    // Workspace edits/sends arrive live: refetch just that quote and swap it
    // in (or drop it once it's deleted or no longer visible).
    this.realtime.quotes$
      .pipe(takeUntilDestroyed(inject(DestroyRef)))
      .subscribe((change) => {
        // A filtered list can't tell locally whether the change still matches.
        if (this.filtering()) {
          this.load();
          return;
        }
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
      if (id) {
        void this.router.navigate([this.quotesLink(), id], { replaceUrl: true });
      }
    });
  }

  private loadSeq = 0;

  protected load(): void {
    const query: ListQuotesQuery = {
      take: 100,
      ...(this.status() !== ANY ? { status: this.status() as PortalQuoteStatus } : {}),
      ...(this.projectId() ? { projectId: this.projectId() } : {}),
    };
    // Only the latest filter's answer counts.
    const seq = ++this.loadSeq;
    this.quotesApi.list(query).subscribe({
      next: (res) => {
        if (seq !== this.loadSeq) return;
        this.quotes.set(res.results);
        this.loading.set(false);
      },
      error: () => {
        if (seq === this.loadSeq) this.loading.set(false);
      },
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
}
