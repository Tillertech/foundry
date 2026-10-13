import { Currency } from './currencies';

/** Prisma Decimal columns arrive as strings; coerce for display and math. */
export function num(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function money(
  amount: number | string,
  currency: Currency = 'USD',
): string {
  // No fraction-digit override: each currency keeps its own minor unit
  // (JPY 0, USD 2, KWD 3).
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(
    num(amount),
  );
}

/**
 * Multipliers into `target` keyed by source currency - the shape the API's
 * exchange-rate lookup returns. A currency is absent when no rate is known.
 */
export interface CurrencyRates {
  target: Currency;
  rates: Partial<Record<Currency, number>>;
}

/** Amount expressed in `rates.target`, or null when the rate isn't known. */
export function convertAmount(
  amount: number | string,
  from: Currency,
  rates: CurrencyRates | null | undefined,
): number | null {
  if (!rates) return null;
  if (from === rates.target) return num(amount);
  const rate = rates.rates[from];
  return rate === undefined ? null : num(amount) * rate;
}

/**
 * '≈ KES 12,900.00' for an amount held in another currency; empty when it is
 * already in the target currency or can't be converted, so callers can drop
 * the line entirely.
 */
export function convertedLabel(
  amount: number | string,
  from: Currency,
  rates: CurrencyRates | null | undefined,
): string {
  if (!rates || from === rates.target) return '';
  const converted = convertAmount(amount, from, rates);
  return converted === null ? '' : `≈ ${money(converted, rates.target)}`;
}

/** `YYYY-MM-DD` slice of an ISO date-time string, for display and date inputs. */
export function isoDay(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : '';
}

/** Expands a `YYYY-MM-DD` input value to the full ISO date-time the API stores. */
export function toApiDate(day: string): string {
  return day.length === 10 ? `${day}T00:00:00.000Z` : day;
}

/** Local ids for line-item drafts before the API assigns real ones. */
export function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** 'on_hold' → 'On hold', for enum values shown in select triggers. */
export function humanize(value: unknown): string {
  const s = String(value ?? '').replace(/_/g, ' ');
  return s ? s[0].toUpperCase() + s.slice(1) : '';
}

interface LineItemLike {
  quantity: string | number;
  rate: string | number;
}

interface InvoiceTotalsInput {
  items: LineItemLike[];
  taxRate: string | number;
  discount?: string | number;
}

export function invoiceTotal(inv: InvoiceTotalsInput) {
  const subtotal = inv.items.reduce(
    (s, it) => s + num(it.quantity) * num(it.rate),
    0,
  );
  const discount = num(inv.discount);
  const afterDiscount = Math.max(0, subtotal - discount);
  const tax = afterDiscount * (num(inv.taxRate) / 100);
  return { subtotal, discount, tax, total: afterDiscount + tax };
}

export function quoteTotal(q: {
  items: LineItemLike[];
  taxRate: string | number;
}) {
  const subtotal = q.items.reduce(
    (s, it) => s + num(it.quantity) * num(it.rate),
    0,
  );
  const tax = subtotal * (num(q.taxRate) / 100);
  return { subtotal, tax, total: subtotal + tax };
}
