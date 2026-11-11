import { milestonePlan, quoteAppendix } from './quote-totals';

const line = (o: Record<string, unknown>) => ({
  kind: 'milestone' as const,
  selected: false,
  quantity: 1,
  rate: 100,
  description: 'Line',
  ...o,
});

describe('milestonePlan', () => {
  it('numbers milestones in billing order, picked options before the hand-over', () => {
    const plan = milestonePlan([
      line({
        description: 'Assessment',
        details: ' Review the platform ',
        deliverables: [{ id: 'a', label: 'Feature list' }, { id: 'b', label: ' ' }],
        acceptanceCriteria: 'Client signs off the feature list',
      }),
      line({ description: 'Release', rate: 300, acceptanceCriteria: 'Live on Play Store' }),
      line({ kind: 'option', selected: true, description: 'iOS app', rate: 50 }),
      line({ kind: 'option', selected: false, description: 'Not picked' }),
    ] as never);

    expect(plan.map((m) => [m.code, m.description, m.amount, m.option, m.final])).toEqual([
      ['M01', 'Assessment', 100, false, false],
      ['M02', 'iOS app', 50, true, false],
      ['M03', 'Release', 300, false, true],
    ]);
    expect(plan[0].details).toBe('Review the platform');
    expect(plan[0].deliverables).toEqual(['Feature list']);
  });
});

describe('quoteAppendix', () => {
  const fmt = (n: number) => `KES ${n}`;

  it('lists the lines outside the total, never milestone scope', () => {
    const text = quoteAppendix(
      [
        line({ acceptanceCriteria: 'Live', deliverables: [{ id: 'a', label: 'App' }] }),
        line({ kind: 'recurring', description: 'Support' }),
      ] as never,
      fmt,
    );
    expect(text).toBe('Recurring (not in total)\n- Support: KES 100 / month');
  });
});
