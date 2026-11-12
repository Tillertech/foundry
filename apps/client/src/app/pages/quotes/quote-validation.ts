import { HttpErrorResponse } from '@angular/common/http';
import { QuoteItemKind } from '../../domains/quotes';
import type { QuoteLineDraft } from './quote-lines-editor';

/**
 * What the quote editor checks before anything reaches the API - the same
 * rules the API enforces (CreateQuoteDto / QuoteLineItemDto), phrased for
 * the person writing the quote.
 *
 * Every issue has a stable key naming the control it belongs to:
 *   client · number · issueDate · validUntil · taxRate · retentionPercent ·
 *   items · line:<lineId>:<description|quantity|rate|details|deliverables|
 *   acceptanceCriteria>
 * 
 */
export interface QuoteIssue {
  key: string;
  message: string;
}

/** The parts of the editor's model the rules read. */
export interface QuoteDraft {
  clientId: string;
  number: string;
  issueDate: string;
  validUntil: string;
  taxRate: number | null;
  retentionPercent: number | null;
  items: QuoteLineDraft[];
}

export const lineKey = (lineId: string, field: string) =>
  `line:${lineId}:${field}`;

/** API limits (QuoteLineItemDto / QuoteDeliverableDto). */
const MAX_SCOPE_TEXT = 5000;
const MAX_DELIVERABLE = 500;
const MAX_DELIVERABLES = 100;

const DESCRIBE: Record<QuoteItemKind, string> = {
  milestone: 'Name this milestone - it is what the client signs off',
  standard: 'Describe this line item',
  option: 'Name this option so the client knows what they are picking',
  recurring: 'Describe this monthly charge',
  pass_through: 'Describe this cost',
};

const isNumber = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);

/** "Nov 11, 2026" for a YYYY-MM-DD day, in the user's locale. */
export function humanDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  if (!y || !m || !d) return day;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function percent(
  key: 'taxRate' | 'retentionPercent',
  value: number | null,
  label: string,
): QuoteIssue[] {
  if (!isNumber(value)) {
    return [{ key, message: `Enter a ${label} - use 0 for none` }];
  }
  if (value < 0 || value > 100) {
    return [{ key, message: 'Must be from 0 to 100' }];
  }
  return [];
}

function amount(lineId: string, field: 'quantity' | 'rate', value: number) {
  const key = lineKey(lineId, field);
  if (!isNumber(value)) return [{ key, message: 'Enter a number' }];
  if (value < 0) {
    return [
      {
        key,
        message:
          field === 'rate'
            ? "A rate can't be negative - add a discount line instead"
            : "Quantity can't be negative",
      },
    ];
  }
  return [];
}

function lineIssues(it: QuoteLineDraft): QuoteIssue[] {
  const issues: QuoteIssue[] = [];
  if (!it.description.trim()) {
    issues.push({
      key: lineKey(it.id, 'description'),
      message: DESCRIBE[it.kind],
    });
  }
  issues.push(...amount(it.id, 'quantity', it.quantity));
  issues.push(...amount(it.id, 'rate', it.rate));
  if (it.details.length > MAX_SCOPE_TEXT) {
    issues.push({
      key: lineKey(it.id, 'details'),
      message: `Keep the summary under ${MAX_SCOPE_TEXT.toLocaleString()} characters`,
    });
  }
  if (it.acceptanceCriteria.length > MAX_SCOPE_TEXT) {
    issues.push({
      key: lineKey(it.id, 'acceptanceCriteria'),
      message: `Keep the acceptance criteria under ${MAX_SCOPE_TEXT.toLocaleString()} characters`,
    });
  }
  if (it.deliverables.length > MAX_DELIVERABLES) {
    issues.push({
      key: lineKey(it.id, 'deliverables'),
      message: `A milestone can list up to ${MAX_DELIVERABLES} deliverables`,
    });
  } else if (
    it.deliverables.some((d) => d.label.trim().length > MAX_DELIVERABLE)
  ) {
    issues.push({
      key: lineKey(it.id, 'deliverables'),
      message: `Keep each deliverable under ${MAX_DELIVERABLE} characters`,
    });
  }
  return issues;
}

/**
 * Everything that would stop the quote saving. `sending` adds what would
 * stop the client acting on it: a quote that has already expired.
 */
export function validateQuote(
  q: QuoteDraft,
  opts: { pickClient: boolean; sending?: boolean; today?: string },
): QuoteIssue[] {
  const issues: QuoteIssue[] = [];
  if (opts.pickClient && !q.clientId) {
    issues.push({ key: 'client', message: 'Choose who this quote is for' });
  }
  if (!q.issueDate) {
    issues.push({ key: 'issueDate', message: 'Pick the issue date' });
  }
  if (!q.validUntil) {
    issues.push({
      key: 'validUntil',
      message: 'Pick how long the quote is valid',
    });
  } else if (q.issueDate && q.validUntil < q.issueDate) {
    issues.push({
      key: 'validUntil',
      message: `Must be on or after the issue date (${humanDay(q.issueDate)})`,
    });
  } else if (opts.sending && q.validUntil < (opts.today ?? isoToday())) {
    issues.push({
      key: 'validUntil',
      message:
        'This date has passed - extend it so the client can still accept',
    });
  }
  issues.push(...percent('taxRate', q.taxRate, 'tax rate'));
  issues.push(...percent('retentionPercent', q.retentionPercent, 'retention'));
  if (!q.items.length) {
    issues.push({ key: 'items', message: 'Add at least one line to quote' });
  }
  for (const it of q.items) issues.push(...lineIssues(it));
  return issues;
}

/** Advice that never blocks saving, keyed like issues. */
export function quoteWarnings(
  q: QuoteDraft & { currency: string },
  client: { name: string; currency: string } | null,
): Record<string, string> {
  const warnings: Record<string, string> = {};
  if (client && client.currency !== q.currency) {
    warnings['currency'] =
      `${client.name} is billed in ${client.currency}. You can send this quote in ${q.currency}, but it has to match before it becomes a project.`;
  }
  for (const it of q.items) {
    if (
      it.kind === 'milestone' &&
      it.description.trim() &&
      it.quantity * it.rate === 0
    ) {
      warnings[lineKey(it.id, 'rate')] =
        'No price yet - this milestone will not invoice anything';
    }
  }
  return warnings;
}

const isoToday = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** API property path -> editor key. Lines are matched by position in the request. */
function keyForPath(path: string, items: QuoteLineDraft[]): string | null {
  const line = /^items\.(\d+)\.(\w+)/.exec(path);
  if (line) {
    const it = items[Number(line[1])];
    if (!it) return 'items';
    const field = line[2] === 'deliverables' ? 'deliverables' : line[2];
    return lineKey(it.id, field);
  }
  const top = /^(\w+)/.exec(path)?.[1];
  switch (top) {
    case 'clientId':
      return 'client';
    case 'items':
      return 'items';
    case 'number':
    case 'issueDate':
    case 'validUntil':
    case 'taxRate':
    case 'retentionPercent':
      return top;
    default:
      return null;
  }
}

/**
 * Turns an API rejection into field issues where the API names a field
 * (ValidationPipe 400s, the taken-number 409). Anything it can't place is
 * returned as `unplaced` for a toast.
 */
export function issuesFromApi(
  err: unknown,
  items: QuoteLineDraft[],
): { issues: QuoteIssue[]; unplaced: string[] } {
  if (!(err instanceof HttpErrorResponse)) return { issues: [], unplaced: [] };
  const raw = err.error?.message;
  const messages: string[] = Array.isArray(raw)
    ? raw
    : typeof raw === 'string'
      ? [raw]
      : [];
  const issues: QuoteIssue[] = [];
  const unplaced: string[] = [];
  for (const message of messages) {
    if (err.status === 409 && /quote number/i.test(message)) {
      issues.push({
        key: 'number',
        message:
          'Another quote in this workspace already uses that number - choose another, or clear it to number automatically',
      });
      continue;
    }
    const key =
      err.status === 400 ? keyForPath(message.split(' ')[0], items) : null;
    if (key) {
      issues.push({ key, message: friendly(message) });
    } else {
      unplaced.push(message);
    }
  }
  return { issues, unplaced };
}

/** "items.0.rate must not be less than 0" -> "Must not be less than 0". */
function friendly(message: string): string {
  const rest = message.replace(/^\S+\s+/, '');
  return rest.charAt(0).toUpperCase() + rest.slice(1);
}
