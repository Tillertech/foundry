import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormField, form, minLength, required } from '@angular/forms/signals';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucidePlus, lucideSearch } from '@ng-icons/lucide';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmInput } from '@spartan-ng/helm/input';
import { HlmSelectImports } from '@spartan-ng/helm/select';
import { HlmTextarea } from '@spartan-ng/helm/textarea';
import { apiErrorMessage } from '../../core/http';
import { ApiClient, ClientsApiService } from '../../domains/clients';
import {
  CreateProjectRequest,
  Project,
  ProjectStatus,
  ProjectsApiService,
  UpdateProjectRequest,
} from '../../domains/projects';
import { isoDay, money, num, toApiDate } from '../../domains/shared';
import { ToastService } from '../../core/toast.service';
import { DateField } from '../../shared/date-field';
import { EntitySheet } from '../../shared/entity-sheet';
import { Field } from '../../shared/field';
import { fieldError } from '../../shared/field-error';
import { ListSkeleton } from '../../shared/list-skeleton';
import { PageHeader } from '../../shared/page-header';
import { ReconciliationTimeline } from '../../shared/reconciliation-timeline';
import { StatusBadge } from '../../shared/status-badge';

interface ProjectForm {
  id: string;
  name: string;
  clientId: string;
  status: ProjectStatus;
  budget: number;
  hourlyRate: number;
  startDate: string;
  endDate: string;
  description: string;
}

const emptyProject = (): ProjectForm => ({
  id: '',
  name: '',
  clientId: '',
  status: 'planning',
  budget: 0,
  hourlyRate: 0,
  startDate: new Date().toISOString().slice(0, 10),
  endDate: '',
  description: '',
});

@Component({
  selector: 'app-projects',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormField,
    NgIcon,
    HlmButton,
    HlmInput,
    HlmTextarea,
    HlmSelectImports,
    DateField,
    EntitySheet,
    Field,
    ListSkeleton,
    PageHeader,
    ReconciliationTimeline,
    StatusBadge,
  ],
  providers: [provideIcons({ lucidePlus, lucideSearch })],
  templateUrl: './projects.html',
})
export class Projects {
  private readonly projectsApi = inject(ProjectsApiService);
  private readonly clientsApi = inject(ClientsApiService);
  private readonly toast = inject(ToastService);

  protected readonly loading = signal(true);
  protected readonly projects = signal<Project[]>([]);
  protected readonly clients = signal<ApiClient[]>([]);

  protected readonly query = signal('');
  protected readonly statusFilter = signal('all');
  protected readonly clientFilter = signal('all');
  protected readonly sheetOpen = signal(false);
  protected readonly saving = signal(false);
  protected isNew = true;

  protected readonly model = signal<ProjectForm>(emptyProject());
  protected readonly f = form(this.model, (p) => {
    required(p.name, { message: 'Project name is required' });
    minLength(p.name, 2, { message: 'Use at least 2 characters' });
    required(p.clientId, { message: 'Select a client' });
  });
  protected readonly fieldError = fieldError;

  constructor() {
    this.refresh();
  }

  private refresh(): void {
    this.projectsApi.list({ take: 100 }).subscribe({
      next: (res) => {
        this.projects.set(res.results);
        this.loading.set(false);
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
    this.model.set({
      ...emptyProject(),
      clientId: this.clients()[0]?.id ?? '',
    });
    this.isNew = true;
    this.sheetOpen.set(true);
  }

  protected openEdit(p: Project): void {
    this.model.set({
      id: p.id,
      name: p.name,
      clientId: p.clientId,
      status: p.status,
      budget: num(p.budget),
      hourlyRate: num(p.hourlyRate),
      startDate: isoDay(p.startDate),
      endDate: isoDay(p.endDate),
      description: p.description ?? '',
    });
    this.isNew = false;
    this.sheetOpen.set(true);
  }

  protected save(): void {
    if (this.f().invalid() || this.saving()) return;
    const v = this.model();
    const common: UpdateProjectRequest = {
      name: v.name.trim(),
      status: v.status,
      budget: num(v.budget),
      hourlyRate: num(v.hourlyRate),
      startDate: toApiDate(v.startDate),
      endDate: v.endDate ? toApiDate(v.endDate) : undefined,
      description: v.description.trim() || undefined,
    };
    this.saving.set(true);
    const request = this.isNew
      ? this.projectsApi.create({
          ...common,
          clientId: v.clientId,
        } as CreateProjectRequest)
      : this.projectsApi.update(v.id, common);
    request.subscribe({
      next: (project) => {
        this.saving.set(false);
        this.projects.update((list) =>
          this.isNew
            ? [project, ...list]
            : list.map((p) => (p.id === project.id ? project : p)),
        );
        this.sheetOpen.set(false);
        if (this.isNew) this.toast.created('Project');
        else this.toast.updated('Project');
      },
      error: (err) => {
        this.saving.set(false);
        this.toast.error('Could not save project', apiErrorMessage(err));
      },
    });
  }

  protected removeCurrent(): void {
    const id = this.model().id;
    this.projectsApi.delete(id).subscribe({
      next: () => {
        this.projects.update((list) => list.filter((p) => p.id !== id));
        this.sheetOpen.set(false);
        this.toast.deleted('Project');
      },
      error: (err) =>
        this.toast.error('Could not delete project', apiErrorMessage(err)),
    });
  }

  protected readonly money = money;
  protected readonly day = isoDay;
}
