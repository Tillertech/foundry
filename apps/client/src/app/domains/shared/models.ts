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
