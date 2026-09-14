import { Currency } from '@foundry/shared-util';
import { InvoiceItem } from '../invoices';

export type QuoteStatus =
  'draft' | 'sent' | 'accepted' | 'declined' | 'expired';

export interface Quote {
  id: string;
  number: string;
  status: QuoteStatus;
  issueDate: string;
  validUntil: string;
  currency: Currency;
  taxRate: string;
  notes: string | null;
  items: InvoiceItem[];
  createdAt: string;
  updatedAt: string;
}
