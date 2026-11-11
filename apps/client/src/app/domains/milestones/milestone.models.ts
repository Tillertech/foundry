import { InvoiceStatus } from '../invoices';

export type MilestoneStatus =
  | 'not_started'
  | 'in_progress'
  /** Handed over, waiting for the client's sign-off. */
  | 'delivered'
  /** Signed off - the billing trigger for a priced milestone. */
  | 'accepted'
  | 'completed'
  | 'on_hold'
  | 'cancelled';

/** When a priced milestone is invoiced. */
export type MilestoneBillingTrigger = 'on_acceptance' | 'upfront' | 'manual';

export interface DeliverableLink {
  label: string;
  url: string;
}

export interface MilestoneDeliverable {
  id: string;
  label: string;
  done: boolean;
  /** What was done / what to look at - shown to the client when reviewing. */
  note?: string;
  /** Evidence: builds, staging URLs, recordings. */
  links?: DeliverableLink[];
  /** Evidence files: documents of this project or its client. */
  documentIds?: string[];
}

export type MilestoneReviewDecision = 'approved' | 'changes_requested';

/** One round of the client's review in the portal. */
export interface MilestoneReview {
  id: string;
  round: number;
  decision: MilestoneReviewDecision;
  /** deliverableId null = about the milestone as a whole. */
  comments: { deliverableId: string | null; body: string }[];
  criteriaConfirmed: boolean;
  reviewerName: string;
  reviewerEmail: string;
  createdAt: string;
}

export interface MilestoneInvoiceSummary {
  id: string;
  number: string;
  status: InvoiceStatus;
}

export interface Milestone {
  id: string;
  name: string;
  description: string | null;
  status: MilestoneStatus;
  dueDate: string | null;
  completedAt: string | null;
  estimatedHours: number | null;
  notes: string | null;
  /** Position within the project's milestone list (lower sorts first). */
  order: number;
  /** Fixed price in the client's currency; null = not billed per milestone. */
  amount: string | null;
  billingTrigger: MilestoneBillingTrigger;
  /** Final milestone: its invoice releases everything retained. */
  releasesRetention: boolean;
  /** Retention held back on its invoice. */
  retainedAmount: string;
  deliverables: MilestoneDeliverable[];
  acceptanceCriteria: string | null;
  deliveredAt: string | null;
  acceptedAt: string | null;
  acceptedBy: string | null;
  invoice: MilestoneInvoiceSummary | null;
  /** Client review rounds, oldest first. */
  reviews: MilestoneReview[];
  projectId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMilestoneRequest {
  projectId: string;
  name: string;
  description?: string;
  status?: MilestoneStatus;
  dueDate?: string;
  estimatedHours?: number;
  notes?: string;
  order?: number;
  amount?: number | null;
  billingTrigger?: MilestoneBillingTrigger;
  releasesRetention?: boolean;
  deliverables?: MilestoneDeliverable[];
  acceptanceCriteria?: string;
  acceptedBy?: string;
}

export type UpdateMilestoneRequest = Partial<
  Omit<CreateMilestoneRequest, 'projectId' | 'order'>
>;

export interface ReorderMilestonesRequest {
  projectId: string;
  /** Every milestone id for the project, in the desired order. */
  ids: string[];
}

/** Progress rollup for a project's card on the listing page. */
export interface ProjectMilestonesSummary {
  projectId: string;
  total: number;
  completed: number;
  progress: number | null;
  currentMilestoneName: string | null;
}

/** Finished work: completed (unpriced) or accepted (signed off). */
export const isMilestoneDone = (m: Pick<Milestone, 'status'>) =>
  m.status === 'completed' || m.status === 'accepted';
