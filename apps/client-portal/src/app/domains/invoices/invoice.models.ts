import { Currency } from '@foundry/shared-util';

export type InvoiceStatus =
  | 'draft'
  | 'sent'
  | 'viewed'
  | 'partially_paid'
  | 'paid'
  | 'overpaid'
  | 'overdue'
  | 'cancelled';

export interface InvoiceItem {
  id: string;
  description: string;
  quantity: string;
  rate: string;
  /** Set when this line re-bills a cost the workspace incurred on the client's behalf. */
  expenseId: string | null;
  /** Summary of that cost; null for regular lines or if it was since removed. */
  expense: { vendor: string; category: string; date: string } | null;
}

/** A project a record belongs to, as far as this portal user can see. */
export interface ProjectRef {
  id: string;
  name: string;
}

export interface Invoice {
  id: string;
  number: string;
  status: InvoiceStatus;
  issueDate: string;
  dueDate: string;
  currency: Currency;
  taxRate: string;
  discount: string;
  notes: string | null;
  /** Null when the invoice has no project, or it isn't shared with you. */
  projectId: string | null;
  /** The project this invoice bills (only projects shared with you). */
  project: ProjectRef | null;
  /** Total incl. tax, after discount. */
  total: number;
  amountPaid: number;
  balanceDue: number;
  items: InvoiceItem[];
  createdAt: string;
  updatedAt: string;
}
