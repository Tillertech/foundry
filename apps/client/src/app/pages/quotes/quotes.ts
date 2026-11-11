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
import {
  lucideBadgeCheck,
  lucideFolderKanban,
  lucidePlus,
  lucideSearch,
} from '@ng-icons/lucide';
import { toast } from '@spartan-ng/brain/sonner';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmInput } from '@spartan-ng/helm/input';
import { HlmSelectImports } from '@spartan-ng/helm/select';
import { apiErrorMessage, isoDay, money, quoteTotal } from '@foundry/shared-util';
import { PageHeader, StatusBadge } from '@foundry/shared-ui';
import { ApiClient, ClientsApiService } from '../../domains/clients';
import { Project, ProjectsApiService } from '../../domains/projects';
import { Quote, QuotesApiService } from '../../domains/quotes';
import { WorkspaceCurrencyService } from '../../domains/workspaces';
import { WorkspaceRealtimeService } from '../../core/realtime/workspace-realtime.service';
import { ListSkeleton } from '../../shared/list-skeleton';

/** The quotes list; each quote opens as its own page (quote-editor). */
@Component({
  selector: 'app-quotes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgIcon,
    RouterLink,
    HlmButton,
    HlmInput,
    HlmSelectImports,
    ListSkeleton,
    PageHeader,
    StatusBadge,
  ],
  providers: [
    provideIcons({
      lucideBadgeCheck,
      lucideFolderKanban,
      lucidePlus,
      lucideSearch,
    }),
  ],
  templateUrl: './quotes.html',
})
export class Quotes {
  private readonly quotesApi = inject(QuotesApiService);
  private readonly clientsApi = inject(ClientsApiService);
  private readonly projectsApi = inject(ProjectsApiService);
  private readonly realtime = inject(WorkspaceRealtimeService);
  private readonly router = inject(Router);
  protected readonly fx = inject(WorkspaceCurrencyService);

  /** Legacy `?quote=<id>` links land on the quote's own page. */
  readonly quote = input<string>();

  protected readonly loading = signal(true);
  protected readonly quotes = signal<Quote[]>([]);
  protected readonly clients = signal<ApiClient[]>([]);
  /** Projects created from quotes, for the list chip. */
  protected readonly projects = signal<Project[]>([]);

  protected readonly query = signal('');
  protected readonly statusFilter = signal('all');

  constructor() {
    effect(() => {
      const id = this.quote();
      if (id) void this.router.navigate(['/quotes', id], { replaceUrl: true });
    });

    this.fx.refresh();
    this.refresh();

    // The client answering in the portal arrives live.
    const destroyRef = inject(DestroyRef);
    this.realtime.quotes$
      .pipe(takeUntilDestroyed(destroyRef))
      .subscribe(() => this.loadQuotes());
    this.realtime.reconnected$
      .pipe(takeUntilDestroyed(destroyRef))
      .subscribe(() => this.loadQuotes());
  }

  private loadQuotes(): void {
    this.quotesApi.list({ take: 100 }).subscribe({
      next: (res) => this.quotes.set(res.results),
      error: () => undefined,
    });
  }

  private refresh(): void {
    this.quotesApi.list({ take: 100 }).subscribe({
      next: (res) => {
        this.quotes.set(res.results);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        toast.error('Could not load quotes', {
          description: apiErrorMessage(err),
        });
      },
    });
    this.clientsApi.list({ take: 100 }).subscribe({
      next: (res) => this.clients.set(res.results),
      error: () => undefined,
    });
    this.projectsApi.list({ take: 100 }).subscribe({
      next: (res) => this.projects.set(res.results),
      error: () => undefined,
    });
  }

  protected readonly projectMap = computed(() =>
    Object.fromEntries(this.projects().map((p) => [p.id, p])),
  );

  protected readonly clientMap = computed(() =>
    Object.fromEntries(this.clients().map((c) => [c.id, c])),
  );

  /** "Ada" out of "Ada <ada@x.com>". */
  protected readonly responder = (q: Quote) =>
    (q.respondedBy ?? '').replace(/\s*<[^>]*>$/, '') || 'The client';

  private readonly statusLabels: Record<string, string> = {
    draft: 'Draft',
    sent: 'Sent',
    accepted: 'Accepted',
    declined: 'Declined',
    expired: 'Expired',
  };
  protected readonly statusFilterLabel = (v: string) =>
    v === 'all' ? 'All statuses' : (this.statusLabels[v] ?? v);

  protected readonly filtered = computed(() => {
    const term = this.query().toLowerCase();
    const status = this.statusFilter();
    const clientMap = this.clientMap();
    return this.quotes()
      .filter(
        (q) =>
          (status === 'all' || q.status === status) &&
          (!term ||
            q.number.toLowerCase().includes(term) ||
            (clientMap[q.clientId]?.company || clientMap[q.clientId]?.name || '')
              .toLowerCase()
              .includes(term)),
      )
      .slice()
      .sort((a, b) => (a.issueDate < b.issueDate ? 1 : -1));
  });

  protected total(q: Quote): number {
    return quoteTotal(q).total;
  }

  protected readonly money = money;
  protected readonly day = isoDay;
}
