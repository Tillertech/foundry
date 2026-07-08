// Shared kernel: value types used across several domains.

export type Currency = 'USD' | 'EUR' | 'GBP' | 'KES';

/** Lifecycle shared by workspaces and clients. */
export type ClientStatus = 'active' | 'lead' | 'archived';

/** Line item payload for invoice and quote writes. */
export interface LineItemRequest {
  description: string;
  quantity: number;
  rate: number;
}

export type ReconciliationKind = 'payment_applied' | 'payment_reversed';

/**
 * One step of the payment reconciliation timeline, shared by invoices and
 * projects: the applied/reversed amount plus the balances after the entry.
 */
export interface ReconciliationEntry {
  id: string;
  kind: ReconciliationKind;
  /** Negative when a payment was reversed. */
  amount: string;
  currency: Currency;
  /** Amount still owed on the invoice after this entry. */
  invoiceBalance: string | null;
  /** Project budget remaining after this entry. */
  projectBalance: string | null;
  note: string | null;
  paymentId: string | null;
  invoiceId: string | null;
  projectId: string | null;
  createdAt: string;
}
