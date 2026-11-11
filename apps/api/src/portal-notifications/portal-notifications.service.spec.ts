import type { Mock } from 'vitest';
import { PortalNotificationsService } from './portal-notifications.service';

describe('PortalNotificationsService', () => {
  let service: PortalNotificationsService;
  let prisma: {
    clientPortal: { findUnique: Mock };
    clientPortalUser: { findMany: Mock };
    portalNotification: { createManyAndReturn: Mock };
  };
  let gateway: { emitToUsers: Mock };

  const workspace = {
    portalViewProjects: true,
    portalViewDocuments: true,
    portalViewQuotes: true,
    portalViewPayments: true,
  };
  const portal = (overrides: Record<string, unknown> = {}) => ({
    id: 'portal-1',
    active: true,
    permission: {
      inherit: true,
      viewProjects: false,
      viewDocuments: false,
      viewQuotes: false,
      viewPayments: false,
    },
    client: { workspace },
    clientPortalProjects: [{ id: 'share-1' }],
    ...overrides,
  });

  beforeEach(() => {
    prisma = {
      clientPortal: { findUnique: vi.fn().mockResolvedValue(portal()) },
      clientPortalUser: {
        findMany: vi.fn().mockResolvedValue([{ id: 'u-1' }, { id: 'u-2' }]),
      },
      portalNotification: {
        createManyAndReturn: vi.fn(async ({ data }) =>
          data.map((d: object, i: number) => ({ id: `n-${i}`, ...d })),
        ),
      },
    };
    gateway = { emitToUsers: vi.fn() };
    service = new PortalNotificationsService(
      prisma as any,
      {} as any,
      gateway as any,
    );
  });

  describe('recipients', () => {
    it('returns the non-suspended users when the effective flag is on', async () => {
      await expect(service.recipients('c-1', 'viewQuotes')).resolves.toEqual([
        'u-1',
        'u-2',
      ]);
      expect(prisma.clientPortalUser.findMany.mock.calls[0][0].where).toEqual({
        clientPortalId: 'portal-1',
        status: { not: 'suspended' },
      });
    });

    it('nobody when the client has no portal or it is disabled', async () => {
      prisma.clientPortal.findUnique.mockResolvedValueOnce(null);
      await expect(service.recipients('c-1', 'viewQuotes')).resolves.toEqual(
        [],
      );
      prisma.clientPortal.findUnique.mockResolvedValueOnce(
        portal({ active: false }),
      );
      await expect(service.recipients('c-1', 'viewQuotes')).resolves.toEqual(
        [],
      );
      expect(prisma.clientPortalUser.findMany).not.toHaveBeenCalled();
    });

    it("honours the portal's own flags once it stops inheriting", async () => {
      prisma.clientPortal.findUnique.mockResolvedValue(
        portal({
          permission: {
            inherit: false,
            viewProjects: true,
            viewDocuments: true,
            viewQuotes: false,
            viewPayments: true,
          },
        }),
      );
      await expect(service.recipients('c-1', 'viewQuotes')).resolves.toEqual(
        [],
      );
    });

    it('nobody for a project that is not actively shared', async () => {
      prisma.clientPortal.findUnique.mockResolvedValue(
        portal({ clientPortalProjects: [] }),
      );
      await expect(
        service.recipients('c-1', 'viewProjects', 'p-1'),
      ).resolves.toEqual([]);
    });

    it('billing news of an unshared project still reaches all-projects users', async () => {
      prisma.clientPortal.findUnique.mockResolvedValue(
        portal({ clientPortalProjects: [] }),
      );
      await service.recipients('c-1', 'viewPayments', 'p-1', { billing: true });
      expect(
        prisma.clientPortalUser.findMany.mock.calls[0][0].where.OR,
      ).toEqual([{ allProjects: true }]);
    });

    it('billing news of a shared project reaches users limited to it', async () => {
      await service.recipients('c-1', 'viewPayments', 'p-1', { billing: true });
      expect(
        prisma.clientPortalUser.findMany.mock.calls[0][0].where.OR,
      ).toEqual([
        { allProjects: true },
        { projects: { some: { projectId: 'p-1' } } },
      ]);
    });

    it('narrows project news to users whose access covers the project', async () => {
      await service.recipients('c-1', 'viewProjects', 'p-1');
      expect(
        prisma.clientPortalUser.findMany.mock.calls[0][0].where.OR,
      ).toEqual([
        { allProjects: true },
        { projects: { some: { projectId: 'p-1' } } },
      ]);
    });
  });

  it('stores one notification per user and pushes each to its own room', async () => {
    await service.notify(['u-1', 'u-2'], {
      kind: 'quote_sent',
      title: 'New quote Q-1',
      body: 'x',
      resourceId: 'q-1',
    });

    expect(
      prisma.portalNotification.createManyAndReturn.mock.calls[0][0].data,
    ).toEqual([
      {
        clientPortalUserId: 'u-1',
        kind: 'quote_sent',
        title: 'New quote Q-1',
        body: 'x',
        resourceId: 'q-1',
      },
      {
        clientPortalUserId: 'u-2',
        kind: 'quote_sent',
        title: 'New quote Q-1',
        body: 'x',
        resourceId: 'q-1',
      },
    ]);
    expect(gateway.emitToUsers).toHaveBeenCalledTimes(2);
    expect(gateway.emitToUsers.mock.calls[0][0]).toEqual(['u-1']);
  });

  it('writes nothing for an empty audience', async () => {
    await service.notify([], { kind: 'quote_sent', title: 't', body: 'b' });
    expect(
      prisma.portalNotification.createManyAndReturn,
    ).not.toHaveBeenCalled();
  });
});
