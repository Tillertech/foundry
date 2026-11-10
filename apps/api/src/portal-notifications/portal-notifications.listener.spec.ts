import type { Mock } from 'vitest';
import { PortalNotificationsListener } from './portal-notifications.listener';

describe('PortalNotificationsListener', () => {
  let listener: PortalNotificationsListener;
  let prisma: {
    project: { findUnique: Mock };
    workspace: { findUnique: Mock };
  };
  let portal: { recipients: Mock; notify: Mock; push: Mock };

  beforeEach(() => {
    prisma = {
      project: {
        findUnique: vi
          .fn()
          .mockResolvedValue({
            id: 'p-1',
            name: 'Griid Android',
            clientId: 'c-1',
          }),
      },
      workspace: { findUnique: vi.fn().mockResolvedValue({ name: 'Tiller' }) },
    };
    portal = {
      recipients: vi.fn().mockResolvedValue(['u-1']),
      notify: vi.fn(),
      push: vi.fn(),
    };
    listener = new PortalNotificationsListener(prisma as any, portal as any);
  });

  const changed = (overrides: Record<string, unknown> = {}) => ({
    projectId: 'p-1',
    milestoneId: 'm-1',
    name: 'M02 Android build',
    ...overrides,
  });

  it('pushes a live refresh to users who can see the project', async () => {
    await listener.onMilestoneChanged(changed());

    expect(portal.recipients).toHaveBeenCalledWith(
      'c-1',
      'viewProjects',
      'p-1',
    );
    expect(portal.push).toHaveBeenCalledWith(['u-1'], 'milestone.changed', {
      projectId: 'p-1',
      milestoneId: 'm-1',
      removed: false,
    });
    expect(portal.notify).not.toHaveBeenCalled();
  });

  it.each([
    ['in_progress', 'milestone_started', 'Work started: M02 Android build'],
    [
      'delivered',
      'milestone_delivered',
      'Ready for your review: M02 Android build',
    ],
    ['accepted', 'milestone_accepted', 'Signed off: M02 Android build'],
  ])(
    'stores a notification when a milestone moves to %s',
    async (status, kind, title) => {
      await listener.onMilestoneChanged(
        changed({ status, previousStatus: 'not_started' }),
      );

      expect(portal.notify).toHaveBeenCalledWith(
        ['u-1'],
        expect.objectContaining({ kind, title, resourceId: 'p-1' }),
      );
    },
  );

  it('stays silent when nobody in the portal can see the project', async () => {
    portal.recipients.mockResolvedValue([]);
    await listener.onMilestoneChanged(changed({ status: 'delivered' }));
    expect(portal.push).not.toHaveBeenCalled();
    expect(portal.notify).not.toHaveBeenCalled();
  });

  it('never throws back into the workspace action', async () => {
    portal.recipients.mockRejectedValue(new Error('db down'));
    await expect(
      listener.onMilestoneChanged(changed()),
    ).resolves.toBeUndefined();
  });

  it('notifies and refreshes quote viewers when a quote is sent', async () => {
    await listener.onQuoteSent({
      quote: {
        id: 'q-1',
        number: 'Q-2001',
        currency: 'KES',
        taxRate: '16',
        validUntil: new Date('2026-12-10'),
        items: [
          { kind: 'milestone', quantity: '1', rate: '100000', selected: false },
        ],
      },
      client: { id: 'c-1', workspaceId: 'ws-1' },
    } as any);

    expect(portal.recipients).toHaveBeenCalledWith('c-1', 'viewQuotes');
    expect(portal.notify).toHaveBeenCalledWith(
      ['u-1'],
      expect.objectContaining({
        kind: 'quote_sent',
        title: 'New quote Q-2001',
        body: 'Tiller sent you a quote for KES 116,000.00, valid until 2026-12-10.',
        resourceId: 'q-1',
      }),
    );
    expect(portal.push).toHaveBeenCalledWith(['u-1'], 'quote.changed', {
      quoteId: 'q-1',
      removed: false,
    });
  });
});
