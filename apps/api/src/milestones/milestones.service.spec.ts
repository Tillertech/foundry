import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MilestoneEvents } from '../common/events';
import { MilestonesService } from './milestones.service';

describe('MilestonesService', () => {
  let service: MilestonesService;
  let prisma: {
    milestone: {
      create: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    project: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  };
  let projects: { findOne: jest.Mock };
  let events: { emit: jest.Mock };

  const ownerId = 'owner-1';
  const now = new Date('2026-09-23T12:00:00Z');
  const ownerScope = { project: { client: { workspace: { ownerId } } } };

  const milestone = (overrides: Record<string, unknown> = {}) => ({
    id: 'm-1',
    name: 'Design approval',
    description: null,
    status: 'not_started',
    dueDate: null,
    completedAt: null,
    estimatedHours: null,
    notes: null,
    order: 0,
    projectId: 'project-1',
    ...overrides,
  });

  const client = { id: 'client-1', name: 'Globex', workspaceId: 'ws-1' };
  const project = { id: 'project-1', name: 'Website rebuild', clientId: client.id };

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(now);
    prisma = {
      milestone: {
        create: jest.fn(async ({ data }) => ({ id: 'm-new', ...data })),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        update: jest.fn(async ({ where, data }) => ({
          ...milestone({ id: where.id }),
          ...data,
        })),
        delete: jest.fn(async ({ where }) => milestone({ id: where.id })),
      },
      project: {
        findUnique: jest.fn().mockResolvedValue({ ...project, client }),
      },
      $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
    };
    projects = { findOne: jest.fn().mockResolvedValue(project) };
    events = { emit: jest.fn() };

    service = new MilestonesService(
      prisma as any,
      projects as any,
      events as any,
    );
  });

  afterEach(() => jest.useRealTimers());

  describe('create', () => {
    const dto = { projectId: 'project-1', name: 'Launch' };

    it("checks the project is the caller's before creating", async () => {
      projects.findOne.mockRejectedValue(new NotFoundException());

      await expect(service.create(ownerId, dto)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(projects.findOne).toHaveBeenCalledWith(ownerId, 'project-1');
      expect(prisma.milestone.create).not.toHaveBeenCalled();
    });

    it('appends to the end of the list when no order is given', async () => {
      prisma.milestone.findFirst.mockResolvedValue({ order: 4 });

      await service.create(ownerId, dto);

      expect(prisma.milestone.findFirst).toHaveBeenCalledWith({
        where: { projectId: 'project-1' },
        orderBy: { order: 'desc' },
        select: { order: true },
      });
      expect(prisma.milestone.create).toHaveBeenCalledWith({
        data: { ...dto, order: 5 },
      });
    });

    it('starts a project with no milestones at position 0', async () => {
      prisma.milestone.findFirst.mockResolvedValue(null);

      const result = await service.create(ownerId, dto);

      expect(result.order).toBe(0);
    });

    it('uses an explicit order without looking up the last one', async () => {
      const result = await service.create(ownerId, { ...dto, order: 2 });

      expect(result.order).toBe(2);
      expect(prisma.milestone.findFirst).not.toHaveBeenCalled();
    });

    it('stamps completedAt when a milestone is recorded as already completed', async () => {
      prisma.milestone.findFirst.mockResolvedValue(null);

      const result = await service.create(ownerId, {
        ...dto,
        status: 'completed',
      });

      expect(result.completedAt).toEqual(now);
    });

    it.each(['not_started', 'in_progress', 'cancelled', undefined])(
      'leaves completedAt unset for status %s',
      async (status) => {
        prisma.milestone.findFirst.mockResolvedValue(null);

        const result = await service.create(ownerId, {
          ...dto,
          status: status as any,
        });

        expect(result).not.toHaveProperty('completedAt');
      },
    );

    it('does not notify anyone for a milestone created as completed', async () => {
      prisma.milestone.findFirst.mockResolvedValue(null);

      await service.create(ownerId, { ...dto, status: 'completed' });

      expect(events.emit).not.toHaveBeenCalled();
    });
  });

  describe('findAllForProject', () => {
    it("returns the project's milestones in their manual order", async () => {
      const list = [milestone({ order: 0 }), milestone({ id: 'm-2', order: 1 })];
      prisma.milestone.findMany.mockResolvedValue(list);

      await expect(
        service.findAllForProject(ownerId, 'project-1'),
      ).resolves.toBe(list);
      expect(prisma.milestone.findMany).toHaveBeenCalledWith({
        where: { projectId: 'project-1' },
        orderBy: { order: 'asc' },
      });
    });

    it("404s a project that isn't the caller's", async () => {
      projects.findOne.mockRejectedValue(new NotFoundException());

      await expect(
        service.findAllForProject(ownerId, 'project-9'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.milestone.findMany).not.toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it("scopes the lookup through the project's workspace owner", async () => {
      prisma.milestone.findFirst.mockResolvedValue(milestone());

      await service.findOne(ownerId, 'm-1');

      expect(prisma.milestone.findFirst).toHaveBeenCalledWith({
        where: { id: 'm-1', ...ownerScope },
      });
    });

    it("404s a milestone that doesn't exist or isn't the caller's", async () => {
      prisma.milestone.findFirst.mockResolvedValue(null);

      await expect(service.findOne(ownerId, 'nope')).rejects.toThrow(
        'Milestone not found',
      );
    });
  });

  describe('update', () => {
    const updateData = () => prisma.milestone.update.mock.calls[0][0].data;

    it("404s a milestone that isn't the caller's without writing", async () => {
      prisma.milestone.findFirst.mockResolvedValue(null);

      await expect(
        service.update(ownerId, 'nope', { name: 'x' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.milestone.update).not.toHaveBeenCalled();
    });

    it('writes plain field edits through untouched', async () => {
      prisma.milestone.findFirst.mockResolvedValue(milestone());

      await service.update(ownerId, 'm-1', { name: 'Renamed', notes: 'n' });

      expect(updateData()).toEqual({ name: 'Renamed', notes: 'n' });
    });

    it('stamps completedAt when the status moves into completed', async () => {
      prisma.milestone.findFirst.mockResolvedValue(
        milestone({ status: 'in_progress' }),
      );

      await service.update(ownerId, 'm-1', { status: 'completed' });

      expect(updateData().completedAt).toEqual(now);
    });

    it('keeps an existing completedAt rather than re-stamping it', async () => {
      const earlier = new Date('2026-09-01T00:00:00Z');
      prisma.milestone.findFirst.mockResolvedValue(
        milestone({ status: 'cancelled', completedAt: earlier }),
      );

      await service.update(ownerId, 'm-1', { status: 'completed' });

      expect(updateData().completedAt).toBe(earlier);
    });

    it.each(['not_started', 'in_progress', 'cancelled'])(
      'clears completedAt when a completed milestone moves back to %s',
      async (status) => {
        prisma.milestone.findFirst.mockResolvedValue(
          milestone({ status: 'completed', completedAt: now }),
        );

        await service.update(ownerId, 'm-1', { status: status as any });

        expect(updateData().completedAt).toBeNull();
      },
    );

    it('leaves completedAt alone when the status is re-sent unchanged', async () => {
      prisma.milestone.findFirst.mockResolvedValue(
        milestone({ status: 'completed', completedAt: now }),
      );

      await service.update(ownerId, 'm-1', { status: 'completed', notes: 'x' });

      expect(updateData()).not.toHaveProperty('completedAt');
    });

    describe('completion notification', () => {
      it('emits milestone.completed with the project and its client split apart', async () => {
        prisma.milestone.findFirst.mockResolvedValue(
          milestone({ status: 'in_progress' }),
        );

        const result = await service.update(ownerId, 'm-1', {
          status: 'completed',
        });

        expect(prisma.project.findUnique).toHaveBeenCalledWith({
          where: { id: 'project-1' },
          include: { client: true },
        });
        expect(events.emit).toHaveBeenCalledTimes(1);
        expect(events.emit).toHaveBeenCalledWith(MilestoneEvents.COMPLETED, {
          milestone: result,
          project,
          client,
        });
      });

      it('does not re-notify when an already completed milestone is saved again', async () => {
        prisma.milestone.findFirst.mockResolvedValue(
          milestone({ status: 'completed', completedAt: now }),
        );

        await service.update(ownerId, 'm-1', { status: 'completed' });

        expect(events.emit).not.toHaveBeenCalled();
        expect(prisma.project.findUnique).not.toHaveBeenCalled();
      });

      it.each(['not_started', 'in_progress', 'cancelled'])(
        'does not notify on a move to %s',
        async (status) => {
          prisma.milestone.findFirst.mockResolvedValue(
            milestone({ status: 'completed', completedAt: now }),
          );

          await service.update(ownerId, 'm-1', { status: status as any });

          expect(events.emit).not.toHaveBeenCalled();
        },
      );

      it('does not notify on edits that leave the status out', async () => {
        prisma.milestone.findFirst.mockResolvedValue(milestone());

        await service.update(ownerId, 'm-1', { name: 'Renamed' });

        expect(events.emit).not.toHaveBeenCalled();
      });

      it('skips the event if the project vanished mid-update', async () => {
        prisma.milestone.findFirst.mockResolvedValue(milestone());
        prisma.project.findUnique.mockResolvedValue(null);

        await expect(
          service.update(ownerId, 'm-1', { status: 'completed' }),
        ).resolves.toBeDefined();
        expect(events.emit).not.toHaveBeenCalled();
      });

      it('emits only after the write succeeded', async () => {
        prisma.milestone.findFirst.mockResolvedValue(milestone());
        prisma.milestone.update.mockRejectedValue(new Error('db down'));

        await expect(
          service.update(ownerId, 'm-1', { status: 'completed' }),
        ).rejects.toThrow('db down');
        expect(events.emit).not.toHaveBeenCalled();
      });
    });
  });

  describe('remove', () => {
    it('deletes an owned milestone', async () => {
      prisma.milestone.findFirst.mockResolvedValue(milestone());

      await service.remove(ownerId, 'm-1');

      expect(prisma.milestone.delete).toHaveBeenCalledWith({
        where: { id: 'm-1' },
      });
    });

    it("404s a milestone that isn't the caller's without deleting", async () => {
      prisma.milestone.findFirst.mockResolvedValue(null);

      await expect(service.remove(ownerId, 'nope')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.milestone.delete).not.toHaveBeenCalled();
    });
  });

  describe('reorder', () => {
    const current = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

    beforeEach(() => {
      prisma.milestone.findMany
        .mockResolvedValueOnce(current) // the set check
        .mockResolvedValueOnce([]); // the re-read after the transaction
    });

    it("404s a project that isn't the caller's", async () => {
      projects.findOne.mockRejectedValue(new NotFoundException());

      await expect(
        service.reorder(ownerId, { projectId: 'project-9', ids: ['a'] }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('writes each id its new index in one transaction', async () => {
      await service.reorder(ownerId, {
        projectId: 'project-1',
        ids: ['c', 'a', 'b'],
      });

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.milestone.update.mock.calls.map(([arg]) => arg)).toEqual([
        { where: { id: 'c' }, data: { order: 0 } },
        { where: { id: 'a' }, data: { order: 1 } },
        { where: { id: 'b' }, data: { order: 2 } },
      ]);
    });

    it('returns the re-read list in its new order', async () => {
      const reordered = [{ id: 'c' }, { id: 'a' }, { id: 'b' }];
      prisma.milestone.findMany.mockReset();
      prisma.milestone.findMany
        .mockResolvedValueOnce(current)
        .mockResolvedValueOnce(reordered);

      await expect(
        service.reorder(ownerId, { projectId: 'project-1', ids: ['c', 'a', 'b'] }),
      ).resolves.toBe(reordered);
      expect(prisma.milestone.findMany).toHaveBeenLastCalledWith({
        where: { projectId: 'project-1' },
        orderBy: { order: 'asc' },
      });
    });

    it.each([
      ['a milestone is missing', ['a', 'b']],
      ['an extra id is included', ['a', 'b', 'c', 'd']],
      ['an unknown id replaces a real one', ['a', 'b', 'x']],
      ['an id is repeated in place of another', ['a', 'a', 'b']],
    ])('rejects the list when %s', async (_label, ids) => {
      await expect(
        service.reorder(ownerId, { projectId: 'project-1', ids }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.milestone.update).not.toHaveBeenCalled();
    });
  });

  describe('summaryForProjects', () => {
    it("queries only the caller's non-cancelled milestones for the given projects", async () => {
      await service.summaryForProjects(ownerId, ['p-1', 'p-2']);

      expect(prisma.milestone.findMany).toHaveBeenCalledWith({
        where: {
          projectId: { in: ['p-1', 'p-2'] },
          status: { not: 'cancelled' },
          ...ownerScope,
        },
        select: { projectId: true, status: true, name: true },
      });
    });

    it('summarises each project in the order the ids were given', async () => {
      prisma.milestone.findMany.mockResolvedValue([
        { projectId: 'p-2', status: 'completed', name: 'Kickoff' },
        { projectId: 'p-1', status: 'completed', name: 'Discovery' },
        { projectId: 'p-1', status: 'in_progress', name: 'Design' },
        { projectId: 'p-1', status: 'not_started', name: 'Launch' },
        { projectId: 'p-2', status: 'completed', name: 'Handover' },
      ]);

      const result = await service.summaryForProjects(ownerId, [
        'p-1',
        'p-2',
        'p-3',
      ]);

      expect(result).toEqual([
        {
          projectId: 'p-1',
          total: 3,
          completed: 1,
          progress: 33,
          currentMilestoneName: 'Design',
        },
        {
          projectId: 'p-2',
          total: 2,
          completed: 2,
          progress: 100,
          currentMilestoneName: null,
        },
        {
          projectId: 'p-3',
          total: 0,
          completed: 0,
          progress: null,
          currentMilestoneName: null,
        },
      ]);
    });

    it('rounds progress to the nearest whole percent', async () => {
      prisma.milestone.findMany.mockResolvedValue([
        { projectId: 'p-1', status: 'completed', name: 'a' },
        { projectId: 'p-1', status: 'completed', name: 'b' },
        { projectId: 'p-1', status: 'not_started', name: 'c' },
      ]);

      const [summary] = await service.summaryForProjects(ownerId, ['p-1']);

      expect(summary.progress).toBe(67);
    });

    it("silently drops projects the caller doesn't own (zeroed, not rejected)", async () => {
      // The owner scope in the query means another owner's milestones never
      // come back - the project simply reads as having none.
      prisma.milestone.findMany.mockResolvedValue([]);

      await expect(
        service.summaryForProjects(ownerId, ['someone-elses']),
      ).resolves.toEqual([
        {
          projectId: 'someone-elses',
          total: 0,
          completed: 0,
          progress: null,
          currentMilestoneName: null,
        },
      ]);
      expect(projects.findOne).not.toHaveBeenCalled();
    });
  });
});
