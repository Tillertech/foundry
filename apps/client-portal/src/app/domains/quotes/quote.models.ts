import { Currency } from '@foundry/shared-util';

export type QuoteStatus =
  'draft' | 'sent' | 'accepted' | 'declined' | 'expired';

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
  /** Client-facing scope (milestones). */
  details: string | null;
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
  items: QuoteItem[];
  createdAt: string;
  updatedAt: string;
}
