import { PaginationQuery } from '../../core/http/api.types';
import { Currency, LineItemRequest } from '../shared/models';

export type QuoteStatus =
  'draft' | 'sent' | 'accepted' | 'declined' | 'expired';

export interface QuoteItem {
  id: string;
  description: string;
  quantity: string;
  rate: string;
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
  notes: string | null;
  clientId: string;
  items: QuoteItem[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateQuoteRequest {
  clientId: string;
  number?: string;
  status?: QuoteStatus;
  issueDate: string;
  validUntil: string;
  currency?: Currency;
  taxRate?: number;
  notes?: string;
  items: LineItemRequest[];
}

export type UpdateQuoteRequest = Partial<Omit<CreateQuoteRequest, 'clientId'>>;

export interface ListQuotesQuery extends PaginationQuery {
  clientId?: string;
  status?: QuoteStatus;
}
