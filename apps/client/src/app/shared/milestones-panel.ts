import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import {
  CdkDrag,
  CdkDragDrop,
  CdkDragHandle,
  CdkDropList,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideCheck,
  lucideGripVertical,
  lucidePencil,
  lucidePlus,
  lucideTrash2,
} from '@ng-icons/lucide';
import { HlmButton } from '@spartan-ng/helm/button';
import { apiErrorMessage, isoDay } from '@foundry/shared-util';
import { Milestone, MilestonesApiService } from '../domains/milestones';
import { ToastService } from '@foundry/shared-ui';
import { milestoneStatusLabels } from './milestone-form-sheet';

/**
 * Milestone list + drag-to-reorder/complete/delete actions. Read-only over
 * the `milestones` input - the parent owns the data (it's also needed for
 * the project overview) and the add/edit drawer lives at the parent level
 * too, so every mutation here just calls the API and reports the new list
 * back up via `milestonesChange`, mirroring `LineItemsEditor`'s two-way
 * pattern.
 */
@Component({
  selector: 'app-milestones-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  imports: [NgIcon, HlmButton, CdkDrag, CdkDragHandle, CdkDropList],
  providers: [
    provideIcons({
      lucideCheck,
      lucideGripVertical,
      lucidePencil,
      lucidePlus,
      lucideTrash2,
    }),
  ],
  templateUrl: './milestones-panel.html',
})
export class MilestonesPanel {
  private readonly api = inject(MilestonesApiService);
  private readonly toast = inject(ToastService);

  readonly projectId = input.required<string>();
  readonly milestones = input.required<Milestone[]>();
  readonly milestonesChange = output<Milestone[]>();
  readonly requestNew = output<void>();
  readonly requestEdit = output<Milestone>();

  protected readonly completedCount = () =>
    this.milestones().filter((m) => m.status === 'completed').length;

  protected readonly statusLabel = (v: string) =>
    milestoneStatusLabels[v as Milestone['status']] ?? v;

  protected remove(m: Milestone): void {
    this.api.delete(m.id).subscribe({
      next: () => {
        this.milestonesChange.emit(
          this.milestones().filter((x) => x.id !== m.id),
        );
        this.toast.deleted('Milestone');
      },
      error: (err) =>
        this.toast.error('Could not delete milestone', apiErrorMessage(err)),
    });
  }

  protected markComplete(m: Milestone): void {
    this.api.update(m.id, { status: 'completed' }).subscribe({
      next: (saved) => {
        this.milestonesChange.emit(
          this.milestones().map((x) => (x.id === saved.id ? saved : x)),
        );
        this.toast.success('Milestone completed');
      },
      error: (err) =>
        this.toast.error('Could not update milestone', apiErrorMessage(err)),
    });
  }

  protected drop(event: CdkDragDrop<Milestone[]>): void {
    if (event.previousIndex === event.currentIndex) return;
    const list = this.milestones();
    const reordered = [...list];
    moveItemInArray(reordered, event.previousIndex, event.currentIndex);
    this.milestonesChange.emit(reordered);

    this.api
      .reorder({ projectId: this.projectId(), ids: reordered.map((x) => x.id) })
      .subscribe({
        next: (saved) => this.milestonesChange.emit(saved),
        error: (err) => {
          this.milestonesChange.emit(list);
          this.toast.error('Could not reorder milestones', apiErrorMessage(err));
        },
      });
  }

  protected readonly isoDay = isoDay;
}
