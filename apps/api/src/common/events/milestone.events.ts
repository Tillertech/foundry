import type {
  ClientModel as Client,
  MilestoneModel as Milestone,
  ProjectModel as Project,
} from '../../generated/prisma/models';

export const MilestoneEvents = {
  COMPLETED: 'milestone.completed',
} as const;

/** Emitted when an update moves a milestone into `completed`. */
export interface MilestoneCompletedEvent {
  milestone: Milestone;
  project: Project;
  client: Client;
}
