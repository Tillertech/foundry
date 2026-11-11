import { Currency } from '@foundry/shared-util';

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
  invoiceId: string | null;
  /** The invoice this payment settled. */
  invoice: { id: string; number: string } | null;
  /** That invoice's project (only projects shared with you). */
  project: { id: string; name: string } | null;
  amount: string;
  currency: Currency;
  method: PaymentMethod;
  reference: string | null;
  date: string;
  notes: string | null;
  createdAt: string;
}
