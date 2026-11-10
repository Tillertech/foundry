import type { Mock } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MilestoneEvents } from '../common/events';
import { MILESTONE_INCLUDE, MilestonesService } from './milestones.service';

describe('MilestonesService', () => {
  let service: MilestonesService;
  let prisma: {
    milestone: {
      create: Mock;
      findMany: Mock;
      findFirst: Mock;
      update: Mock;
      delete: Mock;
    };
    project: { findUnique: Mock };
    $transaction: Mock;
  };
  let projects: { findOne: Mock };
  let events: { emit: Mock };
  let billing: { invoice: Mock };

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
    amount: null,
    billingTrigger: 'on_acceptance',
    deliveredAt: null,
    acceptedAt: null,
    acceptedBy: null,
    invoice: null,
    projectId: 'project-1',
    ...overrides,
  });

  const client = { id: 'client-1', name: 'Globex', workspaceId: 'ws-1' };
  const project = { id: 'project-1', name: 'Website rebuild', clientId: client.id };

  beforeEach(() => {
    vi.useFakeTimers().setSystemTime(now);
    prisma = {
      milestone: {
        create: vi.fn(async ({ data }) => ({ id: 'm-new', ...data })),
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn(),
        update: vi.fn(async ({ where, data }) => ({
          ...milestone({ id: where.id }),
          ...data,
        })),
        delete: vi.fn(async ({ where }) => milestone({ id: where.id })),
      },
      project: {
        findUnique: vi.fn().mockResolvedValue({ ...project, client }),
      },
      $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
    };
    projects = { findOne: vi.fn().mockResolvedValue(project) };
    events = { emit: vi.fn() };
    billing = {
      invoice: vi
        .fn()
        .mockResolvedValue({ id: 'inv-1', number: 'INV-1001', status: 'draft' }),
    };

    service = new MilestonesService(
      prisma as any,
      projects as any,
      events as any,
      billing as any,
    );
  });

  afterEach(() => vi.useRealTimers());

  /** milestone.completed emits only - every write also emits milestone.changed. */
  const completedEmits = () =>
    events.emit.mock.calls.filter(([name]) => name === MilestoneEvents.COMPLETED);

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
        include: MILESTONE_INCLUDE,
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

      expect(completedEmits()).toHaveLength(0);
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
        include: MILESTONE_INCLUDE,
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
        include: MILESTONE_INCLUDE,
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
        expect(completedEmits()).toHaveLength(1);
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

        expect(completedEmits()).toHaveLength(0);
        expect(prisma.project.findUnique).not.toHaveBeenCalled();
      });

      it.each(['not_started', 'in_progress', 'cancelled'])(
        'does not notify on a move to %s',
        async (status) => {
          prisma.milestone.findFirst.mockResolvedValue(
            milestone({ status: 'completed', completedAt: now }),
          );

          await service.update(ownerId, 'm-1', { status: status as any });

          expect(completedEmits()).toHaveLength(0);
        },
      );

      it('does not notify on edits that leave the status out', async () => {
        prisma.milestone.findFirst.mockResolvedValue(milestone());

        await service.update(ownerId, 'm-1', { name: 'Renamed' });

        expect(completedEmits()).toHaveLength(0);
      });

      it('skips the event if the project vanished mid-update', async () => {
        prisma.milestone.findFirst.mockResolvedValue(milestone());
        prisma.project.findUnique.mockResolvedValue(null);

        await expect(
          service.update(ownerId, 'm-1', { status: 'completed' }),
        ).resolves.toBeDefined();
        expect(completedEmits()).toHaveLength(0);
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

  describe('live change events', () => {
    it('emits milestone.changed with the status move on update', async () => {
      prisma.milestone.findFirst.mockResolvedValue(milestone({ status: 'in_progress' }));

      await service.update(ownerId, 'm-1', { status: 'delivered' });

      expect(events.emit).toHaveBeenCalledWith(MilestoneEvents.CHANGED, {
        projectId: 'project-1',
        milestoneId: 'm-1',
        name: 'Design approval',
        status: 'delivered',
        previousStatus: 'in_progress',
      });
    });

    it('emits milestone.changed without a status for plain edits', async () => {
      prisma.milestone.findFirst.mockResolvedValue(milestone());

      await service.update(ownerId, 'm-1', { name: 'Design approval' });

      expect(events.emit).toHaveBeenCalledWith(MilestoneEvents.CHANGED, {
        projectId: 'project-1',
        milestoneId: 'm-1',
        name: 'Design approval',
      });
    });

    it('flags removals', async () => {
      prisma.milestone.findFirst.mockResolvedValue(milestone());

      await service.remove(ownerId, 'm-1');

      expect(events.emit).toHaveBeenCalledWith(
        MilestoneEvents.CHANGED,
        expect.objectContaining({ milestoneId: 'm-1', removed: true }),
      );
    });
  });

  describe('sign-off and billing', () => {
    it('stamps delivered, accepted and completed dates when a milestone is accepted', async () => {
      prisma.milestone.findFirst.mockResolvedValue(milestone({ status: 'in_progress' }));

      await service.update(ownerId, 'm-1', { status: 'accepted', acceptedBy: 'Jane' });

      expect(prisma.milestone.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'accepted',
            acceptedBy: 'Jane',
            acceptedAt: now,
            deliveredAt: now,
            completedAt: now,
          }),
        }),
      );
    });

    it('keeps the delivery date from hand-over when accepted later', async () => {
      const delivered = new Date('2026-09-01T00:00:00Z');
      prisma.milestone.findFirst.mockResolvedValue(
        milestone({ status: 'delivered', deliveredAt: delivered }),
      );

      await service.update(ownerId, 'm-1', { status: 'accepted' });

      expect(prisma.milestone.update.mock.calls[0][0].data.deliveredAt).toEqual(delivered);
    });

    it('clears sign-off when an accepted milestone is reopened', async () => {
      prisma.milestone.findFirst.mockResolvedValue(
        milestone({ status: 'accepted', acceptedAt: now, acceptedBy: 'Jane', completedAt: now }),
      );

      await service.update(ownerId, 'm-1', { status: 'in_progress' });

      expect(prisma.milestone.update.mock.calls[0][0].data).toMatchObject({
        acceptedAt: null,
        acceptedBy: null,
        completedAt: null,
        deliveredAt: null,
      });
    });

    it('raises the draft invoice when a priced milestone is accepted, returning the re-read row', async () => {
      const invoiced = milestone({
        status: 'accepted',
        amount: '5000',
        retainedAmount: '500',
        invoice: { id: 'inv-1', number: 'INV-1001', status: 'draft' },
      });
      prisma.milestone.findFirst
        .mockResolvedValueOnce(milestone({ status: 'delivered' }))
        .mockResolvedValueOnce(invoiced);
      prisma.milestone.update.mockImplementation(async ({ data }) => ({
        ...milestone({ amount: '5000' }),
        ...data,
      }));

      const result = await service.update(ownerId, 'm-1', { status: 'accepted' });

      expect(billing.invoice).toHaveBeenCalledWith(ownerId, 'm-1');
      expect(result).toBe(invoiced);
    });

    it.each([
      ['unpriced', { amount: null }],
      ['manual billing', { amount: '5000', billingTrigger: 'manual' }],
      ['already invoiced', { amount: '5000', invoice: { id: 'x', number: 'INV-9', status: 'sent' } }],
    ])('does not invoice a %s milestone on acceptance', async (_label, overrides) => {
      prisma.milestone.findFirst.mockResolvedValue(milestone({ status: 'delivered' }));
      prisma.milestone.update.mockImplementation(async ({ data }) => ({
        ...milestone(overrides),
        ...data,
      }));

      await service.update(ownerId, 'm-1', { status: 'accepted' });

      expect(billing.invoice).not.toHaveBeenCalled();
    });

    it('keeps the sign-off when the invoice cannot be raised', async () => {
      prisma.milestone.findFirst.mockResolvedValue(milestone({ status: 'delivered' }));
      prisma.milestone.update.mockImplementation(async ({ data }) => ({
        ...milestone({ amount: '5000' }),
        ...data,
      }));
      billing.invoice.mockRejectedValue(new Error('numbering exhausted'));

      const result = await service.update(ownerId, 'm-1', { status: 'accepted' });

      expect(result.status).toBe('accepted');
      expect(result.invoice).toBeNull();
    });

    it('counts accepted milestones as done in the summary', async () => {
      prisma.milestone.findMany.mockResolvedValue([
        { projectId: 'p', status: 'accepted', name: 'A' },
        { projectId: 'p', status: 'delivered', name: 'B' },
      ]);

      const [summary] = await service.summaryForProjects(ownerId, ['p']);

      expect(summary).toMatchObject({ total: 2, completed: 1, progress: 50 });
    });
  });

  describe('remove', () => {
    it('deletes an owned milestone', async () => {
      prisma.milestone.findFirst.mockResolvedValue(milestone());

      await service.remove(ownerId, 'm-1');

      expect(prisma.milestone.delete).toHaveBeenCalledWith({
        where: { id: 'm-1' },
        include: MILESTONE_INCLUDE,
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
        include: MILESTONE_INCLUDE,
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
