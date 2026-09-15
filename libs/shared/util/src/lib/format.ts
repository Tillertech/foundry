import { Currency } from './models';

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
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(num(amount));
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

export const currencyLabels: Record<Currency, string> = {
  USD: 'USD - US Dollar',
  EUR: 'EUR - Euro',
  GBP: 'GBP - British Pound',
  KES: 'KES - Kenyan Shilling',
};

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
