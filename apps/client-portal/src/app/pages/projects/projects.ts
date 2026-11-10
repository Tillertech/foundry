import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { PortalRealtimeService } from '../../domains/realtime';
import { refreshOne } from '../../core/live-list';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideArrowRight, lucideCalendarDays } from '@ng-icons/lucide';
import { HlmButton } from '@spartan-ng/helm/button';
import {
  Project,
  ProjectsApiService,
  projectProgress,
} from '../../domains/projects';
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

  protected readonly progressFor = (project: Project) =>
    projectProgress(project.milestones);

  constructor() {
    this.load();
    // Milestone progress on the cards stays live: refetch only the project
    // whose milestone changed (it carries its milestones) and swap that card.
    const realtime = inject(PortalRealtimeService);
    realtime.milestones$.pipe(takeUntilDestroyed()).subscribe((change) => {
      if (!this.projects().some((p) => p.id === change.projectId)) return;
      refreshOne(
        change.projectId,
        false,
        (id) => this.projectsApi.get(id),
        (update) => this.projects.update(update),
      );
    });
    realtime.reconnected$
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.load());
  }

  private load(): void {
    this.projectsApi.list({ take: 100 }).subscribe({
      next: (res) => {
        this.projects.set(res.results);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }
}
