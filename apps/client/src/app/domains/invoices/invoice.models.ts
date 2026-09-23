import { Currency, LineItemRequest, PaginationQuery } from '@foundry/shared-util';

export type { ReconciliationEntry, ReconciliationKind } from '@foundry/shared-util';

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
  invoiceId: string;
  /** Set when this line re-bills a billable expense. */
  expenseId: string | null;
  /** The billed expense's summary; null for regular lines or a since-deleted expense. */
  expense: { vendor: string; category: string; date: string } | null;
}

/** A line to save; `expenseId` re-bills that expense (the API fixes it to 1 x the expense amount). */
export interface InvoiceLineItemRequest extends LineItemRequest {
  expenseId?: string;
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
  /** Last time a due/overdue reminder email went out. */
  lastRemindedAt: string | null;
  project: { name: string } | null;
  clientId: string;
  projectId: string | null;
  items: InvoiceItem[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateInvoiceRequest {
  clientId: string;
  projectId?: string;
  number?: string;
  status?: InvoiceStatus;
  issueDate: string;
  dueDate: string;
  currency?: Currency;
  taxRate?: number;
  discount?: number;
  notes?: string;
  items: InvoiceLineItemRequest[];
}

export type UpdateInvoiceRequest = Partial<
  Omit<CreateInvoiceRequest, 'clientId'>
>;

export interface ListInvoicesQuery extends PaginationQuery {
  clientId?: string;
  projectId?: string;
  status?: InvoiceStatus;
}

/** Multipliers from each currency into `target` (the workspace currency). */
export interface ExchangeRates {
  target: Currency;
  rates: Record<Currency, number>;
}
