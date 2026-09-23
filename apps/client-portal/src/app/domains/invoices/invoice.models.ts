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
  projectId: string | null;
  items: InvoiceItem[];
  createdAt: string;
  updatedAt: string;
}
