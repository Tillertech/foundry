import type { Mock } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PortalContextService } from './portal-context.service';

const allOn = {
  portalViewProjects: true,
  portalViewDocuments: true,
  portalViewQuotes: true,
  portalViewPayments: true,
};

const portal = (over: Record<string, unknown> = {}) => ({
  id: 'portal-1',
  clientId: 'client-1',
  active: true,
  permission: {
    inherit: true,
    viewProjects: true,
    viewDocuments: true,
    viewQuotes: true,
    viewPayments: true,
  },
  client: { workspace: allOn },
  ...over,
});

describe('PortalContextService', () => {
  let service: PortalContextService;
  let prisma: {
    clientPortal: { findUnique: Mock };
    clientPortalUser: { findFirst: Mock };
    clientPortalProject: { findMany: Mock };
  };

  beforeEach(() => {
    prisma = {
      clientPortal: { findUnique: vi.fn().mockResolvedValue(portal()) },
      clientPortalUser: {
        findFirst: vi.fn().mockResolvedValue({ allProjects: true }),
      },
      clientPortalProject: { findMany: vi.fn().mockResolvedValue([]) },
    };
    service = new PortalContextService(prisma as any);
  });

  describe('permissions', () => {
    it('applies the workspace defaults to a portal that inherits', async () => {
      prisma.clientPortal.findUnique.mockResolvedValue(
        portal({
          client: { workspace: { ...allOn, portalViewQuotes: false } },
        }),
      );

      await expect(service.require('portal-1', 'viewQuotes')).rejects.toThrow(
        ForbiddenException,
      );
      await expect(
        service.require('portal-1', 'viewProjects'),
      ).resolves.toEqual(
        expect.objectContaining({
          clientId: 'client-1',
          permission: expect.objectContaining({ viewQuotes: false }),
        }),
      );
    });

    it('ignores a workspace default the portal has overridden with its own flags', async () => {
      prisma.clientPortal.findUnique.mockResolvedValue(
        portal({
          permission: {
            inherit: false,
            viewProjects: true,
            viewDocuments: false,
            viewQuotes: true,
            viewPayments: true,
          },
          client: { workspace: { ...allOn, portalViewQuotes: false } },
        }),
      );

      await expect(
        service.require('portal-1', 'viewQuotes'),
      ).resolves.toBeDefined();
      await expect(
        service.require('portal-1', 'viewDocuments'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('does not let own flags leak through while inheriting', async () => {
      prisma.clientPortal.findUnique.mockResolvedValue(
        portal({
          permission: {
            inherit: true,
            viewProjects: true,
            viewDocuments: true,
            viewQuotes: true,
            viewPayments: true,
          },
          client: { workspace: { ...allOn, portalViewPayments: false } },
        }),
      );

      await expect(service.require('portal-1', 'viewPayments')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('rejects a disabled portal whatever its permissions', async () => {
      prisma.clientPortal.findUnique.mockResolvedValue(
        portal({ active: false }),
      );

      await expect(service.resolve('portal-1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('404s an unknown portal', async () => {
      prisma.clientPortal.findUnique.mockResolvedValue(null);

      await expect(service.resolve('nope')).rejects.toThrow(NotFoundException);
    });
  });

  describe('sharedProjectIds', () => {
    it('gives an all-projects user every active share of the portal', async () => {
      prisma.clientPortalProject.findMany.mockResolvedValue([
        { projectId: 'p1' },
        { projectId: 'p2' },
      ]);

      await expect(
        service.sharedProjectIds('portal-1', 'user-1'),
      ).resolves.toEqual(['p1', 'p2']);
      expect(prisma.clientPortalUser.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1', clientPortalId: 'portal-1' },
        }),
      );
      expect(prisma.clientPortalProject.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { clientPortalId: 'portal-1', active: true },
        }),
      );
    });

    it("narrows a limited user to their own projects, still within the portal's active shares", async () => {
      prisma.clientPortalUser.findFirst.mockResolvedValue({
        allProjects: false,
      });
      prisma.clientPortalProject.findMany.mockResolvedValue([
        { projectId: 'p2' },
      ]);

      await expect(
        service.sharedProjectIds('portal-1', 'user-1'),
      ).resolves.toEqual(['p2']);
      expect(prisma.clientPortalProject.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            clientPortalId: 'portal-1',
            active: true,
            project: {
              clientPortalUserProjects: {
                some: { clientPortalUserId: 'user-1' },
              },
            },
          },
        }),
      );
    });

    it('shares nothing with a user who is not in this portal', async () => {
      prisma.clientPortalUser.findFirst.mockResolvedValue(null);

      await expect(
        service.sharedProjectIds('portal-1', 'someone-else'),
      ).resolves.toEqual([]);
      expect(prisma.clientPortalProject.findMany).not.toHaveBeenCalled();
    });
  });
});
