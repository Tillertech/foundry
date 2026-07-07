import { PaginationQuery } from '../../core/http/api.types';
import { Currency, LineItemRequest } from '../shared/models';

export type InvoiceStatus =
  'draft' | 'sent' | 'viewed' | 'paid' | 'overdue' | 'cancelled';

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
