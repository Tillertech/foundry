import { PaginationQuery } from '../../core/http/api.types';
import { Currency } from '../shared/models';

export type PaymentMethod =
  | 'card'
  | 'bank_transfer'
  | 'stripe'
  | 'paypal'
  | 'cash'
  | 'mobile_money'
  | 'other';

export interface Payment {
  id: string;
  amount: string;
  currency: Currency;
  method: PaymentMethod;
  reference: string | null;
  date: string;
  notes: string | null;
  clientId: string;
  invoiceId: string | null;
  createdAt: string;
}

export interface CreatePaymentRequest {
  clientId: string;
  invoiceId?: string;
  amount: number;
  currency?: Currency;
  method?: PaymentMethod;
  reference?: string;
  date: string;
  notes?: string;
  markInvoicePaid?: boolean;
}

export type UpdatePaymentRequest = Partial<
  Omit<CreatePaymentRequest, 'clientId' | 'markInvoicePaid'>
>;

export interface ListPaymentsQuery extends PaginationQuery {
  clientId?: string;
  invoiceId?: string;
  method?: PaymentMethod;
}
