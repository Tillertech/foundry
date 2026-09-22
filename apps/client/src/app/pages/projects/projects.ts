import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucidePlus, lucideSearch } from '@ng-icons/lucide';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmInput } from '@spartan-ng/helm/input';
import { HlmSelectImports } from '@spartan-ng/helm/select';
import { RouterLink } from '@angular/router';
import { apiErrorMessage, isoDay, money } from '@foundry/shared-util';
import { ApiClient, ClientsApiService } from '../../domains/clients';
import {
  MilestonesApiService,
  ProjectMilestonesSummary,
} from '../../domains/milestones';
import { Project, ProjectsApiService } from '../../domains/projects';
import { PageHeader, StatusBadge, ToastService } from '@foundry/shared-ui';
import { ListSkeleton } from '../../shared/list-skeleton';
import { ProjectFormSheet } from '../../shared/project-form-sheet';

@Component({
  selector: 'app-projects',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgIcon,
    HlmButton,
    HlmInput,
    HlmSelectImports,
    RouterLink,
    ListSkeleton,
    PageHeader,
    ProjectFormSheet,
    StatusBadge,
  ],
  providers: [provideIcons({ lucidePlus, lucideSearch })],
  templateUrl: './projects.html',
})
export class Projects {
  private readonly projectsApi = inject(ProjectsApiService);
  private readonly clientsApi = inject(ClientsApiService);
  private readonly milestonesApi = inject(MilestonesApiService);
  private readonly toast = inject(ToastService);

  protected readonly loading = signal(true);
  protected readonly projects = signal<Project[]>([]);
  protected readonly clients = signal<ApiClient[]>([]);
  protected readonly milestonesSummary = signal<
    Record<string, ProjectMilestonesSummary>
  >({});

  protected readonly query = signal('');
  protected readonly statusFilter = signal('all');
  protected readonly clientFilter = signal('all');

  protected readonly sheetOpen = signal(false);
  protected readonly editingProject = signal<Project | null>(null);

  constructor() {
    this.refresh();
  }

  private refresh(): void {
    this.projectsApi.list({ take: 100 }).subscribe({
      next: (res) => {
        this.projects.set(res.results);
        this.loading.set(false);
        this.refreshMilestonesSummary(res.results.map((p) => p.id));
      },
      error: (err) => {
        this.loading.set(false);
        this.toast.error('Could not load projects', apiErrorMessage(err));
      },
    });
    this.clientsApi.list({ take: 100 }).subscribe({
      next: (res) => this.clients.set(res.results),
      error: () => undefined,
    });
  }

  /** One bulk call for every visible card's progress bar, instead of one per card. */
  private refreshMilestonesSummary(projectIds: string[]): void {
    if (!projectIds.length) return;
    this.milestonesApi.summary(projectIds).subscribe({
      next: (rows) =>
        this.milestonesSummary.set(
          Object.fromEntries(rows.map((r) => [r.projectId, r])),
        ),
      error: () => undefined,
    });
  }

  protected readonly clientMap = computed(() =>
    Object.fromEntries(this.clients().map((c) => [c.id, c])),
  );

  private readonly statusLabels: Record<string, string> = {
    planning: 'Planning',
    active: 'Active',
    on_hold: 'On hold',
    completed: 'Completed',
  };
  protected readonly clientLabel = (v: string) => {
    const c = this.clientMap()[v];
    return c ? c.company || c.name : v;
  };
  protected readonly clientFilterLabel = (v: string) =>
    v === 'all' ? 'All clients' : this.clientLabel(v);
  protected readonly statusLabel = (v: string) => this.statusLabels[v] ?? v;
  protected readonly statusFilterLabel = (v: string) =>
    v === 'all' ? 'All statuses' : this.statusLabel(v);

  protected readonly filtered = computed(() => {
    const term = this.query().toLowerCase();
    const status = this.statusFilter();
    const client = this.clientFilter();
    return this.projects().filter(
      (p) =>
        (status === 'all' || p.status === status) &&
        (client === 'all' || p.clientId === client) &&
        (!term || p.name.toLowerCase().includes(term)),
    );
  });

  protected openNew(): void {
    this.editingProject.set(null);
    this.sheetOpen.set(true);
  }

  protected onProjectSaved(project: Project): void {
    this.projects.update((list) => {
      const exists = list.some((p) => p.id === project.id);
      return exists
        ? list.map((p) => (p.id === project.id ? project : p))
        : [project, ...list];
    });
  }

  protected onProjectDeleted(id: string): void {
    this.projects.update((list) => list.filter((p) => p.id !== id));
  }

  protected readonly money = money;
  protected readonly day = isoDay;
}
