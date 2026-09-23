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
import { HlmInput } from '@spartan-ng/helm/input';
import { HlmSelectImports } from '@spartan-ng/helm/select';
import { HlmTextarea } from '@spartan-ng/helm/textarea';
import { apiErrorMessage, isoDay, toApiDate } from '@foundry/shared-util';
import {
  CreateMilestoneRequest,
  Milestone,
  MilestoneStatus,
  MilestonesApiService,
} from '../domains/milestones';
import { Field, ToastService } from '@foundry/shared-ui';
import { DateField } from './date-field';
import { EntitySheet } from './entity-sheet';

interface MilestoneForm {
  name: string;
  description: string;
  status: MilestoneStatus;
  dueDate: string;
  estimatedHours: number;
  notes: string;
}

const emptyForm = (): MilestoneForm => ({
  name: '',
  description: '',
  status: 'not_started',
  dueDate: '',
  estimatedHours: 0,
  notes: '',
});

export const milestoneStatusLabels: Record<MilestoneStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  completed: 'Completed',
  on_hold: 'On hold',
  cancelled: 'Cancelled',
};

/**
 * Add/edit milestone - a side drawer like every other create/edit form in
 * the app, rather than an inline expand within the list.
 */
@Component({
  selector: 'app-milestone-form-sheet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HlmInput, HlmSelectImports, HlmTextarea, DateField, EntitySheet, Field],
  templateUrl: './milestone-form-sheet.html',
})
export class MilestoneFormSheet {
  private readonly api = inject(MilestonesApiService);
  private readonly toast = inject(ToastService);

  readonly projectId = input.required<string>();
  /** null = create mode. */
  readonly milestone = input<Milestone | null>(null);
  readonly open = model(false);
  readonly saved = output<Milestone>();
  readonly deleted = output<string>();

  protected readonly saving = signal(false);
  protected readonly draft = signal<MilestoneForm>(emptyForm());

  protected readonly statusOptions = Object.entries(milestoneStatusLabels) as [
    MilestoneStatus,
    string,
  ][];
  protected readonly statusLabel = (v: string) =>
    milestoneStatusLabels[v as MilestoneStatus] ?? v;

  protected get isNew(): boolean {
    return !this.milestone();
  }

  constructor() {
    // Reset the draft from the given milestone (or fresh defaults) every
    // time the sheet opens.
    effect(() => {
      const isOpen = this.open();
      if (!isOpen) return;
      const m = untracked(() => this.milestone());
      this.draft.set(
        m
          ? {
              name: m.name,
              description: m.description ?? '',
              status: m.status,
              dueDate: m.dueDate ? isoDay(m.dueDate) : '',
              estimatedHours: m.estimatedHours ?? 0,
              notes: m.notes ?? '',
            }
          : emptyForm(),
      );
    });
  }

  protected patch(p: Partial<MilestoneForm>): void {
    this.draft.update((v) => ({ ...v, ...p }));
  }

  protected save(): void {
    const v = this.draft();
    if (!v.name.trim() || this.saving()) return;
    const current = this.milestone();
    const common = {
      name: v.name.trim(),
      description: v.description.trim() || undefined,
      status: v.status,
      dueDate: v.dueDate ? toApiDate(v.dueDate) : undefined,
      estimatedHours: v.estimatedHours || undefined,
      notes: v.notes.trim() || undefined,
    };
    this.saving.set(true);
    const request = current
      ? this.api.update(current.id, common)
      : this.api.create({
          ...common,
          projectId: this.projectId(),
        } as CreateMilestoneRequest);
    request.subscribe({
      next: (saved) => {
        this.saving.set(false);
        this.open.set(false);
        this.saved.emit(saved);
        this.toast.success(current ? 'Milestone updated' : 'Milestone added');
      },
      error: (err) => {
        this.saving.set(false);
        this.toast.error('Could not save milestone', apiErrorMessage(err));
      },
    });
  }

  protected removeCurrent(): void {
    const current = this.milestone();
    if (!current) return;
    this.api.delete(current.id).subscribe({
      next: () => {
        this.open.set(false);
        this.deleted.emit(current.id);
        this.toast.deleted('Milestone');
      },
      error: (err) =>
        this.toast.error('Could not delete milestone', apiErrorMessage(err)),
    });
  }
}
