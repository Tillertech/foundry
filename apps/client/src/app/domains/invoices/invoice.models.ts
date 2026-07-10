import { PaginationQuery } from '../../core/http/api.types';
import { Currency, LineItemRequest } from '../shared/models';

export type { ReconciliationEntry, ReconciliationKind } from '../shared/models';

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
  items: LineItemRequest[];
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
