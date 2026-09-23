import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArrowRight,
  lucideCircleCheck,
  lucideFileSignature,
  lucideFileText,
  lucideFolderOpen,
  lucideWallet,
} from '@ng-icons/lucide';
import { PortalAuthService } from '../../domains/auth';
import { Invoice, InvoicesApiService } from '../../domains/invoices';
import { Project, ProjectsApiService, projectProgress } from '../../domains/projects';
import { Quote, QuotesApiService } from '../../domains/quotes';
import { invoiceTotal, isoDay, money } from '@foundry/shared-util';
import { StatusBadge } from '@foundry/shared-ui';

interface AttentionItem {
  key: string;
  icon: string;
  title: string;
  detail: string;
  to: string;
}

@Component({
  selector: 'app-portal-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, NgIcon, StatusBadge],
  providers: [
    provideIcons({
      lucideArrowRight,
      lucideCircleCheck,
      lucideFileSignature,
      lucideFileText,
      lucideFolderOpen,
      lucideWallet,
    }),
  ],
  templateUrl: './dashboard.html',
})
export class Dashboard {
  private readonly projectsApi = inject(ProjectsApiService);
  private readonly invoicesApi = inject(InvoicesApiService);
  private readonly quotesApi = inject(QuotesApiService);
  protected readonly auth = inject(PortalAuthService);

  protected readonly me = this.auth.me;
  protected readonly client = computed(
    () => this.me()?.clientPortal.client ?? null,
  );
  protected readonly permission = computed(
    () => this.me()?.clientPortal.permission ?? null,
  );
  protected readonly firstName = computed(
    () => (this.me()?.name ?? 'there').split(' ')[0],
  );

  protected readonly base = computed(() => `/${this.auth.slug() ?? ''}`);
  protected readonly projectsLink = computed(() => `${this.base()}/projects`);

  protected readonly loading = signal(true);
  protected readonly projects = signal<Project[]>([]);
  protected readonly invoices = signal<Invoice[]>([]);
  protected readonly quotes = signal<Quote[]>([]);

  /** The active project the client would most want to check on right now. */
  protected readonly primaryProject = computed(() => {
    const list = this.projects();
    return (
      list.find((p) => p.status === 'active') ??
      list.find((p) => p.status === 'planning') ??
      null
    );
  });
  protected readonly primaryProgress = computed(() => {
    const project = this.primaryProject();
    return project ? projectProgress(project.milestones) : null;
  });

  protected readonly attention = computed<AttentionItem[]>(() => {
    const permission = this.permission();
    const base = this.base();
    const items: AttentionItem[] = [];
    if (permission?.viewQuotes) {
      for (const q of this.quotes()) {
        if (q.status !== 'sent') continue;
        items.push({
          key: `quote-${q.id}`,
          icon: 'lucideFileSignature',
          title: 'Quote awaiting approval',
          detail: `${q.number} is ready for your review.`,
          to: `${base}/quotes`,
        });
      }
    }
    if (permission?.viewPayments) {
      for (const i of this.invoices()) {
        if (i.status !== 'sent' && i.status !== 'viewed' && i.status !== 'overdue') {
          continue;
        }
        items.push({
          key: `invoice-${i.id}`,
          icon: 'lucideFileText',
          title: i.status === 'overdue' ? 'Invoice overdue' : 'Invoice due',
          detail: `${i.number} · ${money(invoiceTotal(i).total, i.currency)} due ${isoDay(i.dueDate)}`,
          to: `${base}/invoices`,
        });
      }
    }
    return items;
  });

  protected readonly shortcuts = computed(() => {
    const permission = this.permission();
    const base = this.base();
    return [
      {
        to: `${base}/quotes`,
        label: 'Quotes',
        icon: 'lucideFileSignature',
        visible: permission?.viewQuotes ?? false,
      },
      {
        to: `${base}/invoices`,
        label: 'Invoices',
        icon: 'lucideFileText',
        visible: permission?.viewPayments ?? false,
      },
      {
        to: `${base}/payments`,
        label: 'Payments',
        icon: 'lucideWallet',
        visible: permission?.viewPayments ?? false,
      },
      {
        to: `${base}/documents`,
        label: 'Documents',
        icon: 'lucideFolderOpen',
        visible: permission?.viewDocuments ?? false,
      },
    ].filter((s) => s.visible);
  });

  constructor() {
    if (this.permission()?.viewProjects) {
      this.projectsApi.list({ take: 50 }).subscribe({
        next: (res) => {
          this.projects.set(res.results);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
    } else {
      this.loading.set(false);
    }
    if (this.permission()?.viewQuotes) {
      this.quotesApi.list({ take: 20 }).subscribe({
        next: (res) => this.quotes.set(res.results),
        error: () => undefined,
      });
    }
    if (this.permission()?.viewPayments) {
      this.invoicesApi.list({ take: 20 }).subscribe({
        next: (res) => this.invoices.set(res.results),
        error: () => undefined,
      });
    }
  }

  protected readonly isoDay = isoDay;
  protected readonly money = money;
}
