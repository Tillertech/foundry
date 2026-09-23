import { NotFoundException } from '@nestjs/common';
import { ProjectEvents } from '../common/events';
import { ProjectsService } from './projects.service';

describe('ProjectsService', () => {
  let service: ProjectsService;
  let tx: {
    clientPortalProject: { deleteMany: jest.Mock; upsert: jest.Mock };
    expense: { updateMany: jest.Mock };
    document: { updateMany: jest.Mock };
    project: { update: jest.Mock };
  };
  let prisma: {
    project: {
      create: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    client: { findUnique: jest.Mock };
    clientPortal: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  };
  let pagination: { paginate: jest.Mock };
  let clients: { findOne: jest.Mock };
  let events: { emit: jest.Mock };

  const ownerId = 'owner-1';
  const ownerScope = { client: { workspace: { ownerId } } };
  const clientA = { id: 'client-a', name: 'Globex', workspaceId: 'ws-1' };
  const clientB = { id: 'client-b', name: 'Initech', workspaceId: 'ws-2' };

  const project = (overrides: Record<string, unknown> = {}) => ({
    id: 'project-1',
    name: 'Website rebuild',
    status: 'planning',
    clientId: clientA.id,
    ...overrides,
  });

  beforeEach(() => {
    const applyUpdate = async ({ where, data }: any) => ({
      ...project({ id: where.id }),
      ...data,
    });
    tx = {
      clientPortalProject: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        upsert: jest.fn(),
      },
      expense: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
      document: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      project: { update: jest.fn(applyUpdate) },
    };
    prisma = {
      project: {
        create: jest.fn(async ({ data }) => ({ id: 'project-new', ...data })),
        findFirst: jest.fn().mockResolvedValue(project()),
        update: jest.fn(applyUpdate),
        delete: jest.fn(async ({ where }) => project({ id: where.id })),
      },
      client: {
        findUnique: jest.fn(
          async ({ where }) =>
            [clientA, clientB].find((c) => c.id === where.id) ?? null,
        ),
      },
      clientPortal: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    };
    pagination = { paginate: jest.fn() };
    clients = {
      findOne: jest.fn(async (_owner: string, id: string) => {
        const found = [clientA, clientB].find((c) => c.id === id);
        if (!found) throw new NotFoundException('Client not found');
        return found;
      }),
    };
    events = { emit: jest.fn() };

    service = new ProjectsService(
      prisma as any,
      pagination as any,
      clients as any,
      events as any,
    );
  });

  describe('create', () => {
    const dto = {
      name: 'Launch',
      clientId: clientA.id,
      startDate: '2026-09-01T00:00:00.000Z',
    };

    it("checks the client is the caller's before creating", async () => {
      await expect(
        service.create(ownerId, { ...dto, clientId: 'client-other' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(clients.findOne).toHaveBeenCalledWith(ownerId, 'client-other');
      expect(prisma.project.create).not.toHaveBeenCalled();
    });

    it("shares the new project into the client's portal when there is one", async () => {
      prisma.clientPortal.findUnique.mockResolvedValue({ id: 'portal-a' });

      await service.create(ownerId, dto);

      expect(prisma.clientPortal.findUnique).toHaveBeenCalledWith({
        where: { clientId: clientA.id },
        select: { id: true },
      });
      expect(prisma.project.create).toHaveBeenCalledWith({
        data: {
          ...dto,
          clientPortalProjects: { create: { clientPortalId: 'portal-a' } },
        },
      });
    });

    it('creates a plain project when the client has no portal', async () => {
      await service.create(ownerId, dto);

      expect(prisma.project.create).toHaveBeenCalledWith({ data: dto });
    });
  });

  describe('findAll', () => {
    it('scopes to the owner and applies the filters', async () => {
      await service.findAll(
        ownerId,
        {
          clientId: clientA.id,
          status: 'active',
          take: 20,
          cursor: 'c',
        } as any,
        'http://api/projects',
      );

      expect(pagination.paginate).toHaveBeenCalledWith(
        prisma.project,
        {
          where: { ...ownerScope, clientId: clientA.id, status: 'active' },
        },
        {
          cursor: 'c',
          take: 20,
          orderBy: { startDate: 'desc' },
          baseUrl: 'http://api/projects',
          includeCount: true,
        },
      );
    });

    it('omits filters that were not supplied', async () => {
      await service.findAll(ownerId, {} as any, 'http://api/projects');

      expect(pagination.paginate.mock.calls[0][1]).toEqual({
        where: ownerScope,
      });
    });
  });

  describe('findOne', () => {
    it("scopes the lookup through the client's workspace owner", async () => {
      await service.findOne(ownerId, 'project-1');

      expect(prisma.project.findFirst).toHaveBeenCalledWith({
        where: { id: 'project-1', ...ownerScope },
      });
    });

    it("404s a project that doesn't exist or isn't the caller's", async () => {
      prisma.project.findFirst.mockResolvedValue(null);

      await expect(service.findOne(ownerId, 'nope')).rejects.toThrow(
        'Project not found',
      );
    });
  });

  describe('update', () => {
    it("404s a project that isn't the caller's without writing", async () => {
      prisma.project.findFirst.mockResolvedValue(null);

      await expect(
        service.update(ownerId, 'nope', { name: 'x' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.project.update).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('writes plain edits directly, outside a transaction', async () => {
      await service.update(ownerId, 'project-1', {
        name: 'Renamed',
        budget: 10,
      });

      expect(prisma.project.update).toHaveBeenCalledWith({
        where: { id: 'project-1' },
        data: { name: 'Renamed', budget: 10 },
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(clients.findOne).not.toHaveBeenCalled();
    });

    it('treats re-sending the same client as a plain edit', async () => {
      await service.update(ownerId, 'project-1', { clientId: clientA.id });

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(clients.findOne).not.toHaveBeenCalled();
    });

    describe('moving to another client', () => {
      it("404s a client that isn't the caller's without touching anything", async () => {
        await expect(
          service.update(ownerId, 'project-1', { clientId: 'client-other' }),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(prisma.$transaction).not.toHaveBeenCalled();
        expect(prisma.project.update).not.toHaveBeenCalled();
      });

      it("unshares the project from every other client's portal", async () => {
        await service.update(ownerId, 'project-1', { clientId: clientB.id });

        expect(tx.clientPortalProject.deleteMany).toHaveBeenCalledWith({
          where: {
            projectId: 'project-1',
            clientPortal: { clientId: { not: clientB.id } },
          },
        });
      });

      it("shares it into the new client's portal when there is one", async () => {
        prisma.clientPortal.findUnique.mockResolvedValue({ id: 'portal-b' });

        await service.update(ownerId, 'project-1', { clientId: clientB.id });

        expect(prisma.clientPortal.findUnique).toHaveBeenCalledWith({
          where: { clientId: clientB.id },
          select: { id: true },
        });
        expect(tx.clientPortalProject.upsert).toHaveBeenCalledWith({
          where: {
            clientPortalId_projectId: {
              clientPortalId: 'portal-b',
              projectId: 'project-1',
            },
          },
          create: { clientPortalId: 'portal-b', projectId: 'project-1' },
          update: {},
        });
      });

      it("doesn't share anywhere when the new client has no portal", async () => {
        await service.update(ownerId, 'project-1', { clientId: clientB.id });

        expect(tx.clientPortalProject.upsert).not.toHaveBeenCalled();
      });

      it("moves the project's expenses into the new client's workspace", async () => {
        await service.update(ownerId, 'project-1', { clientId: clientB.id });

        expect(tx.expense.updateMany).toHaveBeenCalledWith({
          where: { projectId: 'project-1' },
          data: { workspaceId: clientB.workspaceId },
        });
      });

      it("refiles the project's client-linked documents under the new client", async () => {
        await service.update(ownerId, 'project-1', { clientId: clientB.id });

        expect(tx.document.updateMany).toHaveBeenCalledWith({
          where: { projectId: 'project-1', clientId: { not: null } },
          data: { clientId: clientB.id, workspaceId: clientB.workspaceId },
        });
      });

      it("moves the project's client-less documents into the new workspace only", async () => {
        await service.update(ownerId, 'project-1', { clientId: clientB.id });

        expect(tx.document.updateMany).toHaveBeenCalledWith({
          where: { projectId: 'project-1', clientId: null },
          data: { workspaceId: clientB.workspaceId },
        });
      });

      it('writes the project change inside the same transaction', async () => {
        const result = await service.update(ownerId, 'project-1', {
          clientId: clientB.id,
          name: 'Moved',
        });

        expect(prisma.$transaction).toHaveBeenCalledTimes(1);
        expect(tx.project.update).toHaveBeenCalledWith({
          where: { id: 'project-1' },
          data: { clientId: clientB.id, name: 'Moved' },
        });
        expect(prisma.project.update).not.toHaveBeenCalled();
        expect(result.clientId).toBe(clientB.id);
      });

      it('fails as a whole if any step of the move fails', async () => {
        tx.expense.updateMany.mockRejectedValue(new Error('db down'));

        await expect(
          service.update(ownerId, 'project-1', { clientId: clientB.id }),
        ).rejects.toThrow('db down');
        expect(tx.project.update).not.toHaveBeenCalled();
        expect(events.emit).not.toHaveBeenCalled();
      });
    });

    describe('status change notification', () => {
      it('emits the change with the previous status and the client', async () => {
        const result = await service.update(ownerId, 'project-1', {
          status: 'active',
        });

        expect(events.emit).toHaveBeenCalledWith(ProjectEvents.STATUS_CHANGED, {
          project: result,
          previousStatus: 'planning',
          client: clientA,
        });
      });

      it('names the new client when status and client change together', async () => {
        await service.update(ownerId, 'project-1', {
          status: 'active',
          clientId: clientB.id,
        });

        expect(events.emit.mock.calls[0][1].client).toEqual(clientB);
      });

      it('does not emit when the status is re-sent unchanged', async () => {
        await service.update(ownerId, 'project-1', { status: 'planning' });

        expect(events.emit).not.toHaveBeenCalled();
      });

      it('does not emit when the status is left out', async () => {
        await service.update(ownerId, 'project-1', { name: 'Renamed' });

        expect(events.emit).not.toHaveBeenCalled();
      });

      it('skips the event if the client vanished mid-update', async () => {
        prisma.client.findUnique.mockResolvedValue(null);

        await service.update(ownerId, 'project-1', { status: 'active' });

        expect(events.emit).not.toHaveBeenCalled();
      });

      it('emits only after the write succeeded', async () => {
        prisma.project.update.mockRejectedValue(new Error('db down'));

        await expect(
          service.update(ownerId, 'project-1', { status: 'active' }),
        ).rejects.toThrow('db down');
        expect(events.emit).not.toHaveBeenCalled();
      });
    });
  });

  describe('remove', () => {
    it('deletes an owned project', async () => {
      await service.remove(ownerId, 'project-1');

      expect(prisma.project.delete).toHaveBeenCalledWith({
        where: { id: 'project-1' },
      });
    });

    it("404s a project that isn't the caller's without deleting", async () => {
      prisma.project.findFirst.mockResolvedValue(null);

      await expect(service.remove(ownerId, 'nope')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.project.delete).not.toHaveBeenCalled();
    });
  });
});
