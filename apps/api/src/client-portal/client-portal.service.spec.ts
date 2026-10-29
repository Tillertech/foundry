import type { Mock } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { ClientPortalService } from './client-portal.service';
import { WorkspaceScope } from '../common/workspace-scope/workspace-scope';

const ownerId = 'owner-1';

const allOn = {
  portalViewProjects: true,
  portalViewDocuments: true,
  portalViewQuotes: true,
  portalViewPayments: true,
};

const portalRow = (over: Record<string, unknown> = {}) => ({
  id: 'portal-1',
  slug: 'northwind',
  active: true,
  clientId: 'client-1',
  createdAt: new Date('2026-10-01'),
  updatedAt: new Date('2026-10-01'),
  permission: {
    id: 'perm-1',
    inherit: true,
    viewProjects: true,
    viewDocuments: true,
    viewQuotes: true,
    viewPayments: true,
    clientPortalId: 'portal-1',
  },
  client: { workspace: allOn },
  clientPortalUsers: [
    {
      id: 'user-1',
      name: 'Elena',
      email: 'elena@example.com',
      status: 'active',
      allProjects: false,
      projects: [{ projectId: 'p1' }],
    },
  ],
  clientPortalProjects: [
    { id: 'share-1', active: true, project: { id: 'p1', name: 'Site' } },
  ],
  ...over,
});

describe('ClientPortalService', () => {
  let service: ClientPortalService;
  let prisma: {
    clientPortal: {
      findUnique: Mock;
      findFirst: Mock;
      create: Mock;
      update: Mock;
      delete: Mock;
    };
    project: { findMany: Mock; findFirst: Mock };
    clientPortalProject: { upsert: Mock };
  };
  let clients: { findOne: Mock };
  let portalUsers: { create: Mock };

  beforeEach(() => {
    prisma = {
      clientPortal: {
        findUnique: vi.fn().mockResolvedValue(null),
        findFirst: vi.fn().mockResolvedValue(portalRow()),
        create: vi.fn().mockResolvedValue({ id: 'portal-1' }),
        update: vi.fn().mockResolvedValue({ id: 'portal-1' }),
        delete: vi.fn(),
      },
      project: {
        findMany: vi.fn().mockResolvedValue([{ id: 'p1' }, { id: 'p2' }]),
        findFirst: vi.fn().mockResolvedValue({ id: 'p1' }),
      },
      clientPortalProject: { upsert: vi.fn() },
    };
    clients = {
      findOne: vi.fn().mockResolvedValue({
        id: 'client-1',
        name: 'Northwind',
        email: 'hello@northwind.test',
      }),
    };
    portalUsers = { create: vi.fn() };
    service = new ClientPortalService(
      prisma as any,
      clients as any,
      {} as any,
      portalUsers as any,
      new WorkspaceScope(),
    );
  });

  describe('response shape', () => {
    it('reports the effective permission and flattened user project access, and drops the workspace', async () => {
      prisma.clientPortal.findFirst.mockResolvedValue(
        portalRow({
          client: { workspace: { ...allOn, portalViewQuotes: false } },
        }),
      );

      const portal = await service.findOne(ownerId, 'portal-1');

      expect(portal.effectivePermission).toEqual({
        viewProjects: true,
        viewDocuments: true,
        viewQuotes: false,
        viewPayments: true,
      });
      expect(portal.permission?.inherit).toBe(true);
      expect(portal.clientPortalUsers[0]).toEqual(
        expect.objectContaining({ allProjects: false, projectIds: ['p1'] }),
      );
      expect(portal.clientPortalUsers[0]).not.toHaveProperty('projects');
      expect(portal).not.toHaveProperty('client');
    });

    it("scopes lookups to the caller's workspaces", async () => {
      prisma.clientPortal.findFirst.mockResolvedValue(null);

      await expect(service.findOne(ownerId, 'portal-1')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.clientPortal.findFirst.mock.calls[0][0].where).toEqual({
        id: 'portal-1',
        client: { workspace: { ownerId } },
      });
    });
  });

  describe('create', () => {
    it('provisions a portal that inherits the workspace defaults, shares existing projects and invites the client', async () => {
      await service.create(ownerId, { clientId: 'client-1' });

      const data = prisma.clientPortal.create.mock.calls[0][0].data;
      // An empty permission row: inherit and the flags take their defaults.
      expect(data.permission).toEqual({ create: {} });
      expect(data.clientPortalProjects.create).toEqual([
        { projectId: 'p1' },
        { projectId: 'p2' },
      ]);
      expect(portalUsers.create).toHaveBeenCalledWith(ownerId, {
        clientPortalId: 'portal-1',
        name: 'Northwind',
        email: 'hello@northwind.test',
      });
    });

    it('returns the existing portal instead of creating a second one', async () => {
      prisma.clientPortal.findUnique.mockResolvedValue({ id: 'portal-1' });

      const portal = await service.create(ownerId, { clientId: 'client-1' });

      expect(portal.id).toBe('portal-1');
      expect(prisma.clientPortal.create).not.toHaveBeenCalled();
      expect(portalUsers.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    const patch = () => prisma.clientPortal.update.mock.calls[0][0].data;

    it('switches a portal to its own permissions when a view flag is set', async () => {
      await service.update(ownerId, 'portal-1', { viewQuotes: false });

      expect(patch()).toEqual({
        permission: { update: { viewQuotes: false, inherit: false } },
      });
    });

    it('goes back to the workspace defaults without touching the stored flags', async () => {
      await service.update(ownerId, 'portal-1', { inheritPermissions: true });

      expect(patch()).toEqual({ permission: { update: { inherit: true } } });
    });

    it('honours an explicit inherit choice sent together with flags', async () => {
      await service.update(ownerId, 'portal-1', {
        inheritPermissions: false,
        viewProjects: true,
        viewDocuments: false,
        viewQuotes: true,
        viewPayments: false,
      });

      expect(patch()).toEqual({
        permission: {
          update: {
            viewProjects: true,
            viewDocuments: false,
            viewQuotes: true,
            viewPayments: false,
            inherit: false,
          },
        },
      });
    });

    it('toggles the portal on its own without touching permissions', async () => {
      await service.update(ownerId, 'portal-1', { active: false });

      expect(patch()).toEqual({ active: false });
    });
  });

  describe('setProjectShared', () => {
    it("shares or hides one of the client's projects", async () => {
      await service.setProjectShared(ownerId, 'portal-1', 'p1', false);

      expect(prisma.project.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'p1', clientId: 'client-1' },
        }),
      );
      expect(prisma.clientPortalProject.upsert).toHaveBeenCalledWith({
        where: {
          clientPortalId_projectId: {
            clientPortalId: 'portal-1',
            projectId: 'p1',
          },
        },
        create: { clientPortalId: 'portal-1', projectId: 'p1', active: false },
        update: { active: false },
      });
    });

    it('refuses a project that belongs to another client', async () => {
      prisma.project.findFirst.mockResolvedValue(null);

      await expect(
        service.setProjectShared(ownerId, 'portal-1', 'foreign', true),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.clientPortalProject.upsert).not.toHaveBeenCalled();
    });
  });
});
