import { QuoteItemKind } from '../../domains/quotes';

/**
 * Mirrors milestoneSchedule() on the API: the lines that become project
 * milestones, in billing order - milestone lines as quoted, with picked
 * options slotted in before the last milestone line (the hand-over, which
 * releases retention). No milestone lines: the picked options alone.
 */
export function milestoneSchedule<T extends { kind: QuoteItemKind; selected: boolean }>(
  items: T[],
): T[] {
  const milestones = items.filter((it) => it.kind === 'milestone');
  const options = items.filter((it) => it.kind === 'option' && it.selected);
  if (!milestones.length) return options;
  return [...milestones.slice(0, -1), ...options, milestones[milestones.length - 1]];
}
