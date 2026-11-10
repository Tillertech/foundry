import { Currency } from '@foundry/shared-util';
export type ProjectStatus = 'planning' | 'active' | 'on_hold' | 'completed';

export type MilestoneStatus =
  | 'not_started'
  | 'in_progress'
  /** Handed over, awaiting the client's sign-off. */
  | 'delivered'
  /** Signed off by the client. */
  | 'accepted'
  | 'completed'
  | 'on_hold'
  | 'cancelled';

export interface MilestoneDeliverable {
  id: string;
  label: string;
  done: boolean;
  /** The team's note on what was done / what to look at. */
  note?: string;
  /** Evidence links (builds, staging, recordings). */
  links?: { label: string; url: string }[];
  /** Evidence files (shared documents). */
  documentIds?: string[];
}

/** One round of a client review: their decision and feedback. */
export interface MilestoneReview {
  id: string;
  round: number;
  decision: 'approved' | 'changes_requested';
  /** deliverableId null = about the milestone as a whole. */
  comments: { deliverableId: string | null; body: string }[];
  criteriaConfirmed: boolean;
  reviewerName: string;
  createdAt: string;
}

export interface ReviewMilestoneRequest {
  decision: 'approve' | 'request_changes';
  comments?: { deliverableId?: string | null; body: string }[];
  criteriaConfirmed?: boolean;
}

/** Client-facing subset - no internal notes, effort estimates or billing. */
export interface ProjectMilestone {
  id: string;
  name: string;
  description: string | null;
  status: MilestoneStatus;
  dueDate: string | null;
  completedAt: string | null;
  order: number;
  deliverables: MilestoneDeliverable[];
  /** What the client checks before signing off. */
  acceptanceCriteria: string | null;
  deliveredAt: string | null;
  acceptedAt: string | null;
  /** Review rounds, oldest first. */
  reviews: MilestoneReview[];
  /** Price - null unless this portal shows payments. */
  amount: string | null;
  billingTrigger: 'on_acceptance' | 'upfront' | 'manual' | null;
  releasesRetention: boolean;
}

export interface Project {
  id: string;
  name: string;
  status: ProjectStatus;
  budget: string;
  hourlyRate: string | null;
  startDate: string;
  endDate: string | null;
  description: string | null;
  milestones: ProjectMilestone[];
  /** Percent held back from milestone invoices until the final milestone. */
  retentionPercent?: string;
  /** The quote this project came from (project detail only). */
  quote?: { id: string; number: string } | null;
  createdAt: string;
  updatedAt: string;
}

/** Finished work: completed, or accepted (signed off). */
export const isMilestoneDone = (m: Pick<ProjectMilestone, 'status'>) =>
  m.status === 'completed' || m.status === 'accepted';

/** Where a project stands financially, in the client's currency. */
export interface ProjectFinancials {
  currency: Currency;
  /** Agreed budget (pre-tax). */
  budget: number;
  /** Total of invoices sent so far (incl. tax). */
  invoiced: number;
  paid: number;
  /** Invoiced but not yet paid. */
  outstanding: number;
  /** Part of outstanding past its due date. */
  overdue: number;
  /** Budget not invoiced yet (pre-tax). */
  remainingToInvoice: number;
  /** Held back on milestone invoices until the final milestone. */
  retentionHeld: number;
  invoiceCount: number;
  /** Invoices in another currency, left out of the sums. */
  otherCurrencyInvoices: number;
  nextDue: { id: string; number: string; dueDate: string; balance: number } | null;
}
