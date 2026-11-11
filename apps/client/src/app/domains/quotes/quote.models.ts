import { PaginationQuery, Currency } from '@foundry/shared-util';
import { Project } from '../projects';

export type QuoteStatus =
  'draft' | 'sent' | 'accepted' | 'declined' | 'expired';

/**
 * standard/milestone count towards the total; recurring is per month and
 * pass_through billed at cost (both quoted alongside the total); option
 * counts only once selected.
 */
export type QuoteItemKind =
  | 'standard'
  | 'milestone'
  | 'recurring'
  | 'pass_through'
  | 'option';

/** A promised deliverable; becomes a checklist item on the milestone. */
export interface QuoteDeliverable {
  id: string;
  label: string;
}

/** A supporting document sent with the quote. */
export interface QuoteAttachment {
  position: number;
  document: {
    id: string;
    name: string;
    mimeType: string | null;
    size: number;
  };
}

export interface QuoteItem {
  id: string;
  description: string;
  quantity: string;
  rate: string;
  kind: QuoteItemKind;
  details: string | null;
  estimatedHours: number | null;
  /** Milestone/option lines: what will be handed over. */
  deliverables: QuoteDeliverable[];
  /** Milestone/option lines: what the client checks before signing off. */
  acceptanceCriteria: string | null;
  selected: boolean;
  position: number;
  /** Milestone generated from this line on conversion. */
  milestoneId: string | null;
  quoteId: string;
}

export interface Quote {
  id: string;
  number: string;
  status: QuoteStatus;
  issueDate: string;
  validUntil: string;
  currency: Currency;
  taxRate: string;
  retentionPercent: string;
  notes: string | null;
  /** When the client accepted/declined in the portal (null if the owner set the status). */
  respondedAt: string | null;
  /** Portal user who answered, "Name <email>". */
  respondedBy: string | null;
  /** Reason given with a decline. */
  responseNote: string | null;
  clientId: string;
  /** Project created from this quote; lines are locked once set. */
  projectId: string | null;
  items: QuoteItem[];
  /** Supporting documents, locked with the lines. */
  attachments: QuoteAttachment[];
  createdAt: string;
  updatedAt: string;
}

export interface QuoteLineRequest {
  description: string;
  quantity: number;
  rate: number;
  kind?: QuoteItemKind;
  details?: string;
  estimatedHours?: number;
  deliverables?: QuoteDeliverable[];
  acceptanceCriteria?: string;
  selected?: boolean;
}

export interface CreateQuoteRequest {
  clientId: string;
  number?: string;
  status?: QuoteStatus;
  issueDate: string;
  validUntil: string;
  currency?: Currency;
  taxRate?: number;
  retentionPercent?: number;
  notes?: string;
  /** In display order. */
  items: QuoteLineRequest[];
  /** Client (or client-project) documents, in order; replaces the list. */
  attachmentIds?: string[];
}

export type UpdateQuoteRequest = Partial<Omit<CreateQuoteRequest, 'clientId'>>;

export interface ConvertQuoteRequest {
  name: string;
  startDate: string;
  endDate?: string;
  hourlyRate?: number;
  /** Raise the first milestone's draft invoice straight away (deposit). */
  invoiceFirstMilestone?: boolean;
}

export interface QuoteConversion {
  quote: Quote;
  project: Project;
  milestoneCount: number;
  upfrontInvoiceNumber: string | null;
}

export interface ListQuotesQuery extends PaginationQuery {
  clientId?: string;
  status?: QuoteStatus;
}
