import { Currency, PaginationQuery } from '@foundry/shared-util';

export type QuoteStatus =
  'draft' | 'sent' | 'accepted' | 'declined' | 'expired';

export type QuoteItemKind =
  | 'standard'
  | 'milestone'
  | 'recurring'
  | 'pass_through'
  | 'option';

/** A promised deliverable - the checklist you'll sign the milestone off against. */
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
  /** Client-facing scope (milestones). */
  details: string | null;
  /** Milestone/option lines: what will be handed over. */
  deliverables: QuoteDeliverable[];
  /** Milestone/option lines: what you check before signing off. */
  acceptanceCriteria: string | null;
  /** Options only: included in the quote. */
  selected: boolean;
  position: number;
}

export interface Quote {
  id: string;
  number: string;
  status: QuoteStatus;
  issueDate: string;
  validUntil: string;
  currency: Currency;
  taxRate: string;
  notes: string | null;
  retentionPercent: string;
  /** When someone at the client accepted/declined it here. */
  respondedAt: string | null;
  /** Who answered, "Name <email>". */
  respondedBy: string | null;
  /** Reason given with a decline. */
  responseNote: string | null;
  /** Project started from this quote - only when it's shared with you. */
  projectId: string | null;
  project: { id: string; name: string } | null;
  items: QuoteItem[];
  /** Supporting documents (terms, specs, designs). */
  attachments: QuoteAttachment[];
  createdAt: string;
  updatedAt: string;
}

/** Statuses a client can see (drafts never reach the portal). */
export type PortalQuoteStatus = Exclude<QuoteStatus, 'draft'>;

export interface ListQuotesQuery extends PaginationQuery {
  status?: PortalQuoteStatus;
  /** Quotes that became this (shared) project. */
  projectId?: string;
}
