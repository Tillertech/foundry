import { isMilestoneDone, ProjectMilestone } from './project.models';

export interface ProjectProgress {
  total: number;
  completed: number;
  /** Percent complete, 0-100; null when the project has no milestones. */
  progress: number | null;
  current: ProjectMilestone | null;
  next: ProjectMilestone | null;
}

/** Mirrors the workspace side's progress calc: cancelled milestones don't count. */
export function projectProgress(milestones: ProjectMilestone[]): ProjectProgress {
  const delivery = milestones.filter((m) => m.status !== 'cancelled');
  const completed = delivery.filter(isMilestoneDone).length;
  return {
    total: delivery.length,
    completed,
    progress: delivery.length
      ? Math.round((completed / delivery.length) * 100)
      : null,
    current: delivery.find((m) => m.status === 'in_progress') ?? null,
    next: delivery.find((m) => m.status === 'not_started') ?? null,
  };
}

/** Delivery stages shown as a track on each milestone, in order. */
export const MILESTONE_STAGES = [
  'Planned',
  'In progress',
  'In review',
  'Signed off',
] as const;

export interface MilestoneProgress {
  /** Index into MILESTONE_STAGES; -1 for a cancelled milestone. */
  stage: number;
  /** Deliverables ticked off / total (null when none are listed). */
  deliverablesDone: number;
  deliverablesTotal: number;
  /** Percent of deliverables done; null when there are none to count. */
  percent: number | null;
  /** Delivered and waiting on the client. */
  awaitingReview: boolean;
}

/**
 * Where one milestone stands. The stage comes from its status; the percent
 * only from its deliverables checklist - with no checklist there is nothing
 * honest to put a number on, so the track alone shows progress.
 */
export function milestoneProgress(m: ProjectMilestone): MilestoneProgress {
  const total = m.deliverables?.length ?? 0;
  const done = m.deliverables?.filter((d) => d.done).length ?? 0;
  const stage =
    m.status === 'cancelled'
      ? -1
      : isMilestoneDone(m)
        ? 3
        : m.status === 'delivered'
          ? 2
          : m.status === 'in_progress'
            ? 1
            : 0;
  return {
    stage,
    deliverablesDone: done,
    deliverablesTotal: total,
    percent: total ? Math.round((done / total) * 100) : null,
    awaitingReview: m.status === 'delivered',
  };
}
