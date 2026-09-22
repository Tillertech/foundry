import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideArrowRight, lucideCalendarDays } from '@ng-icons/lucide';
import { HlmButton } from '@spartan-ng/helm/button';
import { Project, ProjectsApiService } from '../../domains/projects';
import { isoDay, money } from '@foundry/shared-util';
import { EmptyState, StatusBadge } from '@foundry/shared-ui';
import { PortalAuthService } from '../../domains/auth';

@Component({
  selector: 'app-portal-projects',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    NgIcon,
    HlmButton,
    StatusBadge,
    EmptyState,
    NgTemplateOutlet,
  ],
  providers: [provideIcons({ lucideArrowRight, lucideCalendarDays })],
  templateUrl: './projects.html',
})
export class Projects {
  private readonly projectsApi = inject(ProjectsApiService);
  protected readonly auth = inject(PortalAuthService);

  protected readonly isoDay = isoDay;
  protected readonly money = money;

  protected readonly loading = signal(true);
  protected readonly projects = signal<Project[]>([]);
  protected readonly base = computed(() => `/${this.auth.slug() ?? ''}`);
  protected readonly projectsLink = computed(() => `${this.base()}/projects`);

  protected readonly active = computed(() =>
    this.projects().filter((p) => p.status !== 'completed'),
  );
  protected readonly completed = computed(() =>
    this.projects().filter((p) => p.status === 'completed'),
  );

  constructor() {
    this.projectsApi.list({ take: 100 }).subscribe({
      next: (res) => {
        this.projects.set(res.results);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }
}
