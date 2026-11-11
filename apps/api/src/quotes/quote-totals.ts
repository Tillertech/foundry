import { QuoteItemKind } from '../generated/prisma/enums';

interface QuoteLineLike {
  kind?: QuoteItemKind | null;
  selected?: boolean | null;
  quantity: unknown;
  rate: unknown;
}

const amountOf = (it: QuoteLineLike) => Number(it.quantity) * Number(it.rate);

/**
 * Whether a line counts towards the quote's one-off total: plain lines,
 * milestones and options the client picked. Recurring and pass-through
 * lines are quoted separately (per month / at cost).
 */
export function countsTowardsTotal(it: QuoteLineLike): boolean {
  const kind = it.kind ?? QuoteItemKind.standard;
  return (
    kind === QuoteItemKind.standard ||
    kind === QuoteItemKind.milestone ||
    (kind === QuoteItemKind.option && !!it.selected)
  );
}

/**
 * Mirror of quoteTotal() in libs/shared/util - the API keeps its own copy
 * (relative imports only) for PDFs, mails and project conversion.
 */
export function quoteTotals(q: { items: QuoteLineLike[]; taxRate: unknown }) {
  const sum = (pred: (it: QuoteLineLike) => boolean) =>
    q.items.filter(pred).reduce((s, it) => s + amountOf(it), 0);
  const subtotal = sum(countsTowardsTotal);
  const tax = subtotal * ((Number(q.taxRate) || 0) / 100);
  return {
    subtotal,
    tax,
    total: subtotal + tax,
    recurring: sum((it) => it.kind === QuoteItemKind.recurring),
    passThrough: sum((it) => it.kind === QuoteItemKind.pass_through),
  };
}

/**
 * Lines that become project milestones, in billing order: milestone lines
 * as quoted, with picked options slotted in before the last milestone line
 * - that one is the hand-over, the final milestone that releases retention,
 * so add-on scope is delivered (and its retention held) before it. With no
 * milestone lines, the picked options alone, last one final.
 */
export function milestoneSchedule<
  T extends { kind?: QuoteItemKind | null; selected?: boolean | null },
>(items: T[]): T[] {
  const milestones = items.filter((it) => it.kind === QuoteItemKind.milestone);
  const options = items.filter(
    (it) => it.kind === QuoteItemKind.option && !!it.selected,
  );
  if (!milestones.length) return options;
  return [...milestones.slice(0, -1), ...options, milestones[milestones.length - 1]];
}

/**
 * Lines that don't sit in the totals table, as a plain-text appendix for the
 * mail (monthly charges, at-cost estimates, options not taken up). Milestone
 * scope is not repeated here - it lives on its own pages of the PDF. Empty
 * when there are none.
 */
export function quoteAppendix(
  items: (QuoteLineLike & { description: string })[],
  fmt: (n: number) => string,
): string {
  const section = (title: string, rows: typeof items, suffix = '') =>
    rows.length
      ? [
          title,
          ...rows.map((it) => `- ${it.description}: ${fmt(amountOf(it))}${suffix}`),
        ].join('\n')
      : '';
  return [
    section(
      'Recurring (not in total)',
      items.filter((it) => it.kind === QuoteItemKind.recurring),
      ' / month',
    ),
    section(
      'Pass-through costs, billed at cost (estimate, not in total)',
      items.filter((it) => it.kind === QuoteItemKind.pass_through),
    ),
    section(
      'Optional add-ons (not included unless selected)',
      items.filter((it) => it.kind === QuoteItemKind.option && !it.selected),
    ),
  ]
    .filter(Boolean)
    .join('\n\n');
}

interface ScopedLineLike extends QuoteLineLike {
  description: string;
  details?: string | null;
  deliverables?: unknown;
  acceptanceCriteria?: string | null;
}

/** One milestone of the plan the client accepts, with what it promises. */
export interface MilestonePlanEntry {
  /** M01, M02... in billing order - the numbers the project will use. */
  code: string;
  description: string;
  amount: number;
  details: string;
  deliverables: string[];
  acceptanceCriteria: string;
  /** A picked option slotted into the schedule. */
  option: boolean;
  /** The hand-over: releases any retention. */
  final: boolean;
}

/**
 * The priced milestones in billing order, each with its scope - what the
 * quote PDF prints on its scope pages and what the client later signs off.
 */
export function milestonePlan(items: ScopedLineLike[]): MilestonePlanEntry[] {
  const rows = milestoneSchedule(items);
  return rows.map((it, i) => ({
    code: `M${String(i + 1).padStart(2, '0')}`,
    description: it.description,
    amount: amountOf(it),
    details: it.details?.trim() ?? '',
    deliverables: Array.isArray(it.deliverables)
      ? it.deliverables
          .map((d) => (d && typeof d.label === 'string' ? d.label.trim() : ''))
          .filter(Boolean)
      : [],
    acceptanceCriteria: it.acceptanceCriteria?.trim() ?? '',
    option: it.kind === QuoteItemKind.option,
    final: i === rows.length - 1,
  }));
}

/** Whether any milestone carries written scope (so the PDF gets scope pages). */
export const hasScope = (m: MilestonePlanEntry) =>
  !!(m.details || m.deliverables.length || m.acceptanceCriteria);
