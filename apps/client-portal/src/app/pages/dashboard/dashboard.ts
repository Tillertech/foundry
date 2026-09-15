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
  lucideFileSignature,
  lucideFileText,
  lucideFolderOpen,
  lucideWallet,
} from '@ng-icons/lucide';
import { PortalAuthService } from '../../domains/auth';
import { Project, ProjectsApiService } from '../../domains/projects';
import { isoDay } from '@foundry/shared-util';
import { StatusBadge } from '@foundry/shared-ui';

@Component({
  selector: 'app-portal-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, NgIcon, StatusBadge],
  providers: [
    provideIcons({
      lucideArrowRight,
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
  protected readonly auth = inject(PortalAuthService);

  protected readonly isoDay = isoDay;

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

  protected readonly activeProjects = computed(() =>
    this.projects().filter((p) => p.status !== 'completed'),
  );

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
  }
}
