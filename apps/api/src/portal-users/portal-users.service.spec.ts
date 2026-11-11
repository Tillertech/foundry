import type { Mock } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PortalEvents } from '../common/events';
import { PortalUsersService } from './portal-users.service';
import { WorkspaceScope } from '../common/workspace-scope/workspace-scope';

const ownerId = 'owner-1';

const portal = {
  id: 'portal-1',
  slug: 'northwind',
  clientId: 'client-1',
  client: { workspace: { name: 'Acme Studio' } },
};

const row = (over: Record<string, unknown> = {}) => ({
  id: 'user-1',
  name: 'Elena',
  email: 'elena@example.com',
  status: 'invited',
  emailVerifiedAt: null,
  allProjects: true,
  clientPortalId: 'portal-1',
  projects: [] as { projectId: string }[],
  createdAt: new Date('2026-10-01'),
  updatedAt: new Date('2026-10-01'),
  ...over,
});

describe('PortalUsersService', () => {
  let service: PortalUsersService;
  let prisma: {
    clientPortal: { findFirst: Mock };
    clientPortalUser: {
      findUnique: Mock;
      findFirst: Mock;
      create: Mock;
      update: Mock;
      delete: Mock;
    };
    project: { count: Mock };
  };
  let pagination: { paginate: Mock };
  let events: { emit: Mock };

  /** findRow() loads the user together with its portal. */
  const existingUser = (over: Record<string, unknown> = {}) =>
    prisma.clientPortalUser.findFirst.mockResolvedValue({
      ...row(over),
      clientPortal: {
        slug: portal.slug,
        clientId: portal.clientId,
        client: portal.client,
      },
    });

  beforeEach(() => {
    prisma = {
      clientPortal: { findFirst: vi.fn().mockResolvedValue(portal) },
      clientPortalUser: {
        findUnique: vi.fn().mockResolvedValue(null),
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn(async ({ data }) =>
          row({
            name: data.name,
            email: data.email,
            allProjects: data.allProjects,
            projects: data.projects.create,
          }),
        ),
        update: vi.fn(async ({ data }) =>
          row({
            ...('allProjects' in data ? { allProjects: data.allProjects } : {}),
            ...(data.status ? { status: data.status } : {}),
            ...(data.email ? { email: data.email } : {}),
            projects: data.projects?.create ?? [],
          }),
        ),
        delete: vi.fn(),
      },
      project: { count: vi.fn().mockResolvedValue(0) },
    };
    pagination = { paginate: vi.fn() };
    events = { emit: vi.fn() };
    service = new PortalUsersService(
      prisma as any,
      pagination as any,
      events as any,
      new WorkspaceScope(),
    );
  });

  describe('create (invite)', () => {
    const dto = {
      clientPortalId: 'portal-1',
      name: 'Elena',
      email: 'elena@example.com',
    };

    it("inherits the portal's project sharing by default", async () => {
      const user = await service.create(ownerId, dto);

      expect(user).toEqual(
        expect.objectContaining({ allProjects: true, projectIds: [] }),
      );
      expect(prisma.clientPortalUser.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            allProjects: true,
            status: 'invited',
            projects: { create: [] },
          }),
        }),
      );
      expect(prisma.project.count).not.toHaveBeenCalled();
    });

    it('limits the user to specific projects when asked', async () => {
      prisma.project.count.mockResolvedValue(2);

      const user = await service.create(ownerId, {
        ...dto,
        allProjects: false,
        projectIds: ['p1', 'p2'],
      });

      expect(user).toEqual(
        expect.objectContaining({
          allProjects: false,
          projectIds: ['p1', 'p2'],
        }),
      );
      // Ownership is checked against the portal's own client.
      expect(prisma.project.count).toHaveBeenCalledWith({
        where: { id: { in: ['p1', 'p2'] }, clientId: 'client-1' },
      });
    });

    it("refuses projects that are not the portal client's", async () => {
      prisma.project.count.mockResolvedValue(1);

      await expect(
        service.create(ownerId, {
          ...dto,
          allProjects: false,
          projectIds: ['p1', 'someone-elses'],
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.clientPortalUser.create).not.toHaveBeenCalled();
      expect(events.emit).not.toHaveBeenCalled();
    });

    it('refuses a specific-projects invite with no projects chosen', async () => {
      await expect(
        service.create(ownerId, { ...dto, allProjects: false }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.create(ownerId, { ...dto, allProjects: false, projectIds: [] }),
      ).rejects.toThrow(BadRequestException);
    });

    it('ignores a project list sent alongside all-projects access', async () => {
      const user = await service.create(ownerId, {
        ...dto,
        allProjects: true,
        projectIds: ['p1'],
      });

      expect(user.projectIds).toEqual([]);
      expect(prisma.clientPortalUser.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ projects: { create: [] } }),
        }),
      );
    });

    it('emails an invite link and never returns or stores the token in the clear', async () => {
      const user = await service.create(ownerId, dto);

      const [event, emitted] = events.emit.mock.calls[0];
      expect(event).toBe(PortalEvents.USER_INVITED);
      expect(emitted).toEqual(
        expect.objectContaining({
          email: 'elena@example.com',
          portalSlug: 'northwind',
          workspaceName: 'Acme Studio',
        }),
      );
      const stored = prisma.clientPortalUser.create.mock.calls[0][0].data;
      expect(stored.otpSecret).not.toContain(emitted.token);
      expect(JSON.stringify(user)).not.toContain(emitted.token);
    });

    it("404s a portal outside the caller's workspaces", async () => {
      prisma.clientPortal.findFirst.mockResolvedValue(null);

      await expect(service.create(ownerId, dto)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.clientPortal.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: 'portal-1',
            client: { workspace: { ownerId } },
          },
        }),
      );
    });

    it('409s an email already in the portal', async () => {
      prisma.clientPortalUser.findFirst.mockResolvedValue({ id: 'other' });

      await expect(service.create(ownerId, dto)).rejects.toThrow(
        ConflictException,
      );
    });

    it('stores the email lowercased and checks for clashes case-insensitively', async () => {
      await service.create(ownerId, { ...dto, email: '  Elena@Example.COM ' });

      expect(prisma.clientPortalUser.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            email: { equals: 'elena@example.com', mode: 'insensitive' },
          }),
        }),
      );
      expect(prisma.clientPortalUser.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ email: 'elena@example.com' }),
        }),
      );
    });
  });

  describe('update', () => {
    it('replaces the project list when narrowing access', async () => {
      existingUser({ status: 'active' });
      prisma.project.count.mockResolvedValue(1);

      const user = await service.update(ownerId, 'user-1', {
        allProjects: false,
        projectIds: ['p3'],
      });

      expect(user).toEqual(
        expect.objectContaining({ allProjects: false, projectIds: ['p3'] }),
      );
      expect(prisma.clientPortalUser.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            allProjects: false,
            projects: { deleteMany: {}, create: [{ projectId: 'p3' }] },
          },
        }),
      );
    });

    it('clears the list when switching back to all projects', async () => {
      existingUser({
        status: 'active',
        allProjects: false,
        projects: [{ projectId: 'p1' }],
      });

      const user = await service.update(ownerId, 'user-1', {
        allProjects: true,
      });

      expect(user.projectIds).toEqual([]);
      expect(prisma.clientPortalUser.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            allProjects: true,
            projects: { deleteMany: {}, create: [] },
          },
        }),
      );
    });

    it('refuses to leave a limited user with no projects', async () => {
      existingUser({ status: 'active' });

      await expect(
        service.update(ownerId, 'user-1', { allProjects: false }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.clientPortalUser.update).not.toHaveBeenCalled();
    });

    it('leaves project access alone when only the profile changes', async () => {
      existingUser({
        status: 'active',
        allProjects: false,
        projects: [{ projectId: 'p1' }],
      });

      await service.update(ownerId, 'user-1', { name: 'Elena R.' });

      expect(prisma.clientPortalUser.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { name: 'Elena R.' } }),
      );
      expect(prisma.project.count).not.toHaveBeenCalled();
    });

    it('suspends and reactivates an active user', async () => {
      existingUser({ status: 'active' });
      await expect(
        service.update(ownerId, 'user-1', { status: 'suspended' }),
      ).resolves.toEqual(expect.objectContaining({ status: 'suspended' }));

      existingUser({ status: 'suspended', emailVerifiedAt: new Date() });
      await expect(
        service.update(ownerId, 'user-1', { status: 'active' }),
      ).resolves.toEqual(expect.objectContaining({ status: 'active' }));
    });

    it('reactivates a user suspended before accepting back to invited', async () => {
      existingUser({ status: 'suspended', emailVerifiedAt: null });

      await expect(
        service.update(ownerId, 'user-1', { status: 'active' }),
      ).resolves.toEqual(expect.objectContaining({ status: 'invited' }));
    });

    it('re-sends a pending invite when its email changes', async () => {
      existingUser({ status: 'invited' });
      // findRow, then the clash check
      prisma.clientPortalUser.findFirst.mockResolvedValueOnce(
        await prisma.clientPortalUser.findFirst(),
      );
      prisma.clientPortalUser.findFirst.mockResolvedValueOnce(null);

      await service.update(ownerId, 'user-1', { email: 'New@Example.com' });

      expect(prisma.clientPortalUser.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: 'new@example.com',
            otpSecret: expect.stringMatching(/:\d+$/),
          }),
        }),
      );
      expect(events.emit).toHaveBeenCalledWith(
        PortalEvents.USER_INVITED,
        expect.objectContaining({
          email: 'new@example.com',
          portalSlug: portal.slug,
        }),
      );
    });

    it('409s an email change onto another user of the portal', async () => {
      existingUser({ status: 'active' });
      prisma.clientPortalUser.findFirst.mockResolvedValueOnce(
        await prisma.clientPortalUser.findFirst(),
      );
      prisma.clientPortalUser.findFirst.mockResolvedValueOnce({ id: 'other' });

      await expect(
        service.update(ownerId, 'user-1', { email: 'taken@example.com' }),
      ).rejects.toThrow(ConflictException);
      expect(prisma.clientPortalUser.update).not.toHaveBeenCalled();
    });

    it('refuses to activate a user who has not accepted their invite', async () => {
      existingUser({ status: 'invited' });

      await expect(
        service.update(ownerId, 'user-1', { status: 'active' }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.clientPortalUser.update).not.toHaveBeenCalled();
    });

    it("404s a user outside the caller's workspaces", async () => {
      await expect(
        service.update(ownerId, 'user-1', { name: 'X' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('resendInvite', () => {
    it('issues a new link, replacing the stored token', async () => {
      existingUser({ status: 'invited' });

      await service.resendInvite(ownerId, 'user-1');

      const stored = prisma.clientPortalUser.update.mock.calls[0][0].data;
      expect(stored.otpSecret).toMatch(/^\$2[aby]\$.+:\d+$/);
      const [event, emitted] = events.emit.mock.calls[0];
      expect(event).toBe(PortalEvents.USER_INVITED);
      expect(emitted).toEqual(
        expect.objectContaining({
          email: 'elena@example.com',
          portalSlug: 'northwind',
          workspaceName: 'Acme Studio',
          token: expect.stringMatching(/^[0-9a-f]{64}$/),
        }),
      );
      expect(stored.otpSecret).not.toContain(emitted.token);
    });

    it.each(['active', 'suspended'])(
      'refuses for a user who is already %s',
      async (status) => {
        existingUser({ status });

        await expect(service.resendInvite(ownerId, 'user-1')).rejects.toThrow(
          ConflictException,
        );
        expect(events.emit).not.toHaveBeenCalled();
      },
    );
  });

  describe('remove (revoke)', () => {
    it('deletes the user and returns who was removed, without internals', async () => {
      existingUser({ allProjects: false, projects: [{ projectId: 'p1' }] });

      const removed = await service.remove(ownerId, 'user-1');

      expect(prisma.clientPortalUser.delete).toHaveBeenCalledWith({
        where: { id: 'user-1' },
      });
      expect(removed).toEqual(
        expect.objectContaining({ id: 'user-1', projectIds: ['p1'] }),
      );
      expect(Object.keys(removed)).not.toContain('clientPortal');
      expect(Object.keys(removed)).not.toContain('projects');
    });
  });

  describe('findAll', () => {
    it('scopes to the owner and flattens project access', async () => {
      pagination.paginate.mockResolvedValue({
        count: 1,
        next: null,
        previous: null,
        results: [row({ allProjects: false, projects: [{ projectId: 'p1' }] })],
      });

      const page = await service.findAll(
        ownerId,
        { clientPortalId: 'portal-1' } as any,
        'http://x',
      );

      expect(page.results[0]).toEqual(
        expect.objectContaining({ projectIds: ['p1'] }),
      );
      expect(page.results[0]).not.toHaveProperty('projects');
      expect(pagination.paginate.mock.calls[0][1].where).toEqual({
        clientPortal: { client: { workspace: { ownerId } } },
        clientPortalId: 'portal-1',
      });
    });
  });
});
