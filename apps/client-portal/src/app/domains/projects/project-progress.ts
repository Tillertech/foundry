import { ProjectMilestone } from './project.models';

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
  const completed = delivery.filter((m) => m.status === 'completed').length;
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
