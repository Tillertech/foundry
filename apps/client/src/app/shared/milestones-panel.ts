import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import {
  CdkDrag,
  CdkDragDrop,
  CdkDragHandle,
  CdkDropList,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideBadgeCheck,
  lucideCheck,
  lucideGripVertical,
  lucideListChecks,
  lucideMessageSquareWarning,
  lucidePackageCheck,
  lucidePencil,
  lucidePlus,
  lucideReceipt,
  lucideTrash2,
} from '@ng-icons/lucide';
import { BrnAlertDialogContent } from '@spartan-ng/brain/alert-dialog';
import { HlmAlertDialogImports } from '@spartan-ng/helm/alert-dialog';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmDialogService } from '@spartan-ng/helm/dialog';
import { apiErrorMessage, Currency, isoDay, money, num } from '@foundry/shared-util';
import {
  isMilestoneDone,
  Milestone,
  MilestonesApiService,
} from '../domains/milestones';
import { ToastService } from '@foundry/shared-ui';
import { milestoneStatusLabels } from './milestone-form-sheet';
import {
  MilestoneSignoffContext,
  MilestoneSignoffDialog,
} from './milestone-signoff-dialog';

/** Statuses from which a priced milestone can be handed over. */
const DELIVERABLE = new Set(['not_started', 'in_progress', 'on_hold']);

@Component({
  selector: 'app-milestones-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  imports: [
    NgIcon,
    HlmButton,
    CdkDrag,
    CdkDragHandle,
    CdkDropList,
    BrnAlertDialogContent,
    HlmAlertDialogImports,
  ],
  providers: [
    provideIcons({
      lucideBadgeCheck,
      lucideCheck,
      lucideGripVertical,
      lucideListChecks,
      lucideMessageSquareWarning,
      lucidePackageCheck,
      lucidePencil,
      lucidePlus,
      lucideReceipt,
      lucideTrash2,
    }),
  ],
  templateUrl: './milestones-panel.html',
})
export class MilestonesPanel {
  private readonly api = inject(MilestonesApiService);
  private readonly toast = inject(ToastService);
  private readonly dialogService = inject(HlmDialogService);

  readonly projectId = input.required<string>();
  readonly milestones = input.required<Milestone[]>();
  /** The project's client currency (milestone prices are in it). */
  readonly currency = input<Currency>('USD');
  readonly retentionPercent = input(0);
  readonly milestonesChange = output<Milestone[]>();
  readonly requestNew = output<void>();
  readonly requestEdit = output<Milestone>();
  /** A milestone invoice was raised - the host should refresh its invoices. */
  readonly invoiceRaised = output<Milestone>();
  readonly openInvoice = output<string>();

  /** Milestone currently running an action, to disable its buttons. */
  protected readonly busyId = signal<string | null>(null);

  protected readonly completedCount = computed(
    () => this.milestones().filter(isMilestoneDone).length,
  );

  /** Billing rollup across priced, non-cancelled milestones. */
  protected readonly billing = computed(() => {
    const priced = this.milestones().filter(
      (m) => m.amount !== null && m.status !== 'cancelled',
    );
    const value = priced.reduce((s, m) => s + num(m.amount), 0);
    const invoiced = priced
      .filter((m) => m.invoice && m.invoice.status !== 'cancelled')
      .reduce((s, m) => s + num(m.amount), 0);
    const held = priced
      .filter((m) => m.invoice && m.invoice.status !== 'cancelled')
      .reduce((s, m) => s + num(m.retainedAmount), 0);
    const released = priced.some(
      (m) => m.releasesRetention && m.invoice && m.invoice.status !== 'cancelled',
    );
    return { count: priced.length, value, invoiced, held: released ? 0 : held };
  });

  protected readonly statusLabel = (v: string) =>
    milestoneStatusLabels[v as Milestone['status']] ?? v;

  protected isDone = isMilestoneDone;
  protected isPriced = (m: Milestone) => m.amount !== null && num(m.amount) > 0;
  protected canDeliver = (m: Milestone) =>
    this.isPriced(m) && DELIVERABLE.has(m.status);
  protected canSignOff = (m: Milestone) =>
    this.isPriced(m) && m.status === 'delivered';
  /** Accepted (or upfront/manual) priced milestone still without its invoice. */
  protected canRaiseInvoice = (m: Milestone) =>
    this.isPriced(m) &&
    !m.invoice &&
    m.status !== 'cancelled' &&
    (m.status === 'accepted' || m.billingTrigger !== 'on_acceptance');

  /** The client's most recent review round, if any. */
  protected latestReview(m: Milestone) {
    return m.reviews?.length ? m.reviews[m.reviews.length - 1] : null;
  }

  protected deliverableLabel(m: Milestone, deliverableId: string | null): string {
    if (!deliverableId) return 'Overall';
    return m.deliverables.find((d) => d.id === deliverableId)?.label ?? 'Deliverable';
  }

  protected doneDeliverables(m: Milestone): number {
    return m.deliverables.filter((d) => d.done).length;
  }

  protected dotClass(m: Milestone): string {
    if (isMilestoneDone(m)) return 'bg-success';
    if (m.status === 'delivered') return 'bg-info';
    if (m.status === 'in_progress') return 'bg-primary';
    if (m.status === 'cancelled') return 'bg-destructive/60';
    return 'bg-muted-foreground/40';
  }

  protected confirmComplete(m: Milestone, ctx: { close: () => void }): void {
    ctx.close();
    this.run(m, this.api.update(m.id, { status: 'completed' }), 'Milestone completed');
  }

  protected confirmDelete(m: Milestone, ctx: { close: () => void }): void {
    ctx.close();
    this.remove(m);
  }

  protected confirmDeliver(m: Milestone, ctx: { close: () => void }): void {
    ctx.close();
    this.deliver(m);
  }

  protected confirmRaiseInvoice(m: Milestone, ctx: { close: () => void }): void {
    ctx.close();
    this.raiseInvoice(m);
  }

  protected deliver(m: Milestone): void {
    this.run(
      m,
      this.api.update(m.id, { status: 'delivered' }),
      'Marked delivered',
      "The client has been notified. Record the sign-off once they've checked it.",
    );
  }

  protected signOff(m: Milestone): void {
    const ref = this.dialogService.open(MilestoneSignoffDialog, {
      contentClass: 'sm:max-w-md',
      context: {
        milestone: m,
        currency: this.currency(),
        retentionPercent: this.retentionPercent(),
      } satisfies MilestoneSignoffContext,
    });
    ref.closed$.subscribe((result) => {
      const saved = result as Milestone | undefined;
      if (!saved) return;
      this.replace(saved);
      if (saved.invoice) {
        this.invoiceRaised.emit(saved);
        this.toast.success(
          'Milestone accepted',
          `Draft invoice ${saved.invoice.number} is ready to review and send.`,
        );
      } else if (this.isPriced(saved) && saved.billingTrigger === 'on_acceptance') {
        this.toast.info(
          'Milestone accepted',
          'The invoice could not be raised automatically - use "Raise invoice" to retry.',
        );
      } else {
        this.toast.success('Milestone accepted');
      }
    });
  }

  protected raiseInvoice(m: Milestone): void {
    if (this.busyId()) return;
    this.busyId.set(m.id);
    this.api.raiseInvoice(m.id).subscribe({
      next: (saved) => {
        this.busyId.set(null);
        this.replace(saved);
        this.invoiceRaised.emit(saved);
        this.toast.success(
          'Invoice raised',
          `Draft ${saved.invoice?.number ?? ''} is ready to review and send.`,
        );
      },
      error: (err) => {
        this.busyId.set(null);
        this.toast.error('Could not raise invoice', apiErrorMessage(err));
      },
    });
  }

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

  private run(
    m: Milestone,
    request: ReturnType<MilestonesApiService['update']>,
    success: string,
    description?: string,
  ): void {
    if (this.busyId()) return;
    this.busyId.set(m.id);
    request.subscribe({
      next: (saved) => {
        this.busyId.set(null);
        this.replace(saved);
        this.toast.success(success, description);
      },
      error: (err) => {
        this.busyId.set(null);
        this.toast.error('Could not update milestone', apiErrorMessage(err));
      },
    });
  }

  private replace(saved: Milestone): void {
    this.milestonesChange.emit(
      this.milestones().map((x) => (x.id === saved.id ? saved : x)),
    );
  }

  protected fmt(value: string | number | null): string {
    return money(num(value), this.currency());
  }

  protected readonly isoDay = isoDay;
}
