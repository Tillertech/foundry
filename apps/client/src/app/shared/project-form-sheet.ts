import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  model,
  output,
  signal,
  untracked,
} from '@angular/core';
import { FormField, form, minLength, required } from '@angular/forms/signals';
import { HlmInput } from '@spartan-ng/helm/input';
import { HlmSelectImports } from '@spartan-ng/helm/select';
import { HlmTextarea } from '@spartan-ng/helm/textarea';
import { apiErrorMessage, isoDay, num, toApiDate } from '@foundry/shared-util';
import { ApiClient, ClientsApiService } from '../domains/clients';
import {
  CreateProjectRequest,
  Project,
  ProjectStatus,
  ProjectsApiService,
  UpdateProjectRequest,
} from '../domains/projects';
import { DateField } from './date-field';
import { EntitySheet } from './entity-sheet';
import { Field, fieldError, ToastService } from '@foundry/shared-ui';

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

const statusLabels: Record<ProjectStatus, string> = {
  planning: 'Planning',
  active: 'Active',
  on_hold: 'On hold',
  completed: 'Completed',
};

/**
 * Project create/edit sheet - just the project's own fields. Delivery
 * tracking (milestones, invoices, payments) lives on the project detail
 * page, not in here, mirroring how the template keeps configuration
 * separate from delivery.
 */
@Component({
  selector: 'app-project-form-sheet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormField,
    HlmInput,
    HlmSelectImports,
    HlmTextarea,
    DateField,
    EntitySheet,
    Field,
  ],
  templateUrl: './project-form-sheet.html',
})
export class ProjectFormSheet {
  private readonly projectsApi = inject(ProjectsApiService);
  private readonly clientsApi = inject(ClientsApiService);
  private readonly toast = inject(ToastService);

  /** null = create mode. */
  readonly project = input<Project | null>(null);
  readonly open = model(false);
  readonly saved = output<Project>();
  readonly deleted = output<string>();

  protected readonly clients = signal<ApiClient[]>([]);
  protected readonly saving = signal(false);

  protected readonly draft = signal<ProjectForm>(emptyProject());
  protected readonly f = form(this.draft, (p) => {
    required(p.name, { message: 'Project name is required' });
    minLength(p.name, 2, { message: 'Use at least 2 characters' });
    required(p.clientId, { message: 'Select a client' });
  });
  protected readonly fieldError = fieldError;

  protected readonly statusLabel = (v: string) =>
    statusLabels[v as ProjectStatus] ?? v;
  protected readonly clientLabel = (v: string) => {
    const c = this.clients().find((x) => x.id === v);
    return c ? c.company || c.name : v;
  };

  protected get isNew(): boolean {
    return !this.project();
  }

  constructor() {
    this.clientsApi.list({ take: 100 }).subscribe({
      next: (res) => this.clients.set(res.results),
      error: () => undefined,
    });

    // Reset the draft from the given project (or fresh defaults) every time
    // the sheet opens, rather than reacting to `project` on its own - a
    // create-mode open shouldn't inherit whatever the last edit left behind.
    effect(() => {
      const isOpen = this.open();
      if (!isOpen) return;
      const p = untracked(() => this.project());
      this.draft.set(
        p
          ? {
              id: p.id,
              name: p.name,
              clientId: p.clientId,
              status: p.status,
              budget: num(p.budget),
              hourlyRate: num(p.hourlyRate),
              startDate: isoDay(p.startDate),
              endDate: isoDay(p.endDate),
              description: p.description ?? '',
            }
          : {
              ...emptyProject(),
              clientId: untracked(() => this.clients()[0]?.id ?? ''),
            },
      );
    });
  }

  protected save(): void {
    if (this.f().invalid() || this.saving()) return;
    const v = this.draft();
    const common: UpdateProjectRequest = {
      name: v.name.trim(),
      clientId: v.clientId,
      status: v.status,
      budget: num(v.budget),
      hourlyRate: num(v.hourlyRate),
      startDate: toApiDate(v.startDate),
      endDate: v.endDate ? toApiDate(v.endDate) : undefined,
      description: v.description.trim() || undefined,
    };
    this.saving.set(true);
    const request = this.isNew
      ? this.projectsApi.create(common as CreateProjectRequest)
      : this.projectsApi.update(v.id, common);
    request.subscribe({
      next: (project) => {
        this.saving.set(false);
        this.open.set(false);
        this.saved.emit(project);
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
    const id = this.draft().id;
    if (!id) return;
    this.projectsApi.delete(id).subscribe({
      next: () => {
        this.open.set(false);
        this.deleted.emit(id);
        this.toast.deleted('Project');
      },
      error: (err) =>
        this.toast.error('Could not delete project', apiErrorMessage(err)),
    });
  }
}
