import type { MilestoneStatus } from '../../generated/prisma/enums';
import type {
  ClientModel as Client,
  MilestoneModel as Milestone,
  ProjectModel as Project,
} from '../../generated/prisma/models';

export const MilestoneEvents = {
  COMPLETED: 'milestone.completed',
  /** MilestoneChangedEvent - any create/edit/delete/reorder, for live views. */
  CHANGED: 'milestone.changed',
  /** MilestoneInvoicedEvent - a milestone raised its draft invoice. */
  INVOICED: 'milestone.invoiced',
  /** MilestoneReviewedEvent - the client approved or asked for changes in the portal. */
  REVIEWED: 'milestone.reviewed',
} as const;

export interface MilestoneReviewedEvent {
  ownerId: string;
  projectId: string;
  projectName: string;
  milestoneId: string;
  milestoneName: string;
  round: number;
  approved: boolean;
  reviewerName: string;
  commentCount: number;
}

export interface MilestoneChangedEvent {
  projectId: string;
  /** null for a whole-list change (reorder). */
  milestoneId: string | null;
  name: string | null;
  /** Set when the status moved (previousStatus null on create). */
  status?: MilestoneStatus;
  previousStatus?: MilestoneStatus | null;
  removed?: boolean;
}

export interface MilestoneInvoicedEvent {
  ownerId: string;
  milestoneId: string;
  milestoneName: string;
  projectId: string;
  projectName: string;
  invoiceId: string;
  invoiceNumber: string;
}

/** Emitted when an update moves a milestone into a done state (`completed` or `accepted`). */
export interface MilestoneCompletedEvent {
  milestone: Milestone;
  project: Project;
  client: Client;
}
