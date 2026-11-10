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

export interface QuoteItem {
  id: string;
  description: string;
  quantity: string;
  rate: string;
  kind: QuoteItemKind;
  details: string | null;
  estimatedHours: number | null;
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
