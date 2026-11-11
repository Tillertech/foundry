import type { Mock } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PortalMilestoneReviewService } from './portal-milestone-review.service';

describe('PortalMilestoneReviewService', () => {
  let service: PortalMilestoneReviewService;
  let prisma: any;
  let context: { require: Mock; sharedProjectIds: Mock };
  let milestones: { update: Mock };
  let events: { emit: Mock };

  const milestone = (overrides: Record<string, unknown> = {}) => ({
    id: 'm-1',
    name: 'M04 Android build',
    status: 'delivered',
    deliverables: [{ id: 'd1', label: 'Checkout', done: true }],
    acceptanceCriteria: 'Builds install on test devices',
    project: { name: 'Griid Android', client: { workspace: { ownerId: 'owner-1' } } },
    _count: { reviews: 1 },
    ...overrides,
  });

  beforeEach(() => {
    prisma = {
      clientPortalUser: {
        findUnique: vi.fn().mockResolvedValue({ name: 'Ada', email: 'ada@griid.test', canApproveMilestones: true }),
      },
      milestone: { findFirst: vi.fn().mockResolvedValue(milestone()) },
      milestoneReview: {
        create: vi.fn().mockResolvedValue({ id: 'r-2' }),
        delete: vi.fn().mockResolvedValue({}),
      },
    };
    context = {
      require: vi.fn().mockResolvedValue({}),
      sharedProjectIds: vi.fn().mockResolvedValue(['p-1']),
    };
    milestones = { update: vi.fn().mockResolvedValue({}) };
    events = { emit: vi.fn() };
    service = new PortalMilestoneReviewService(prisma, context as any, milestones as any, events as any);
  });

  it('approves through the owner sign-off path and records round n+1', async () => {
    await service.review('portal-1', 'pu-1', 'p-1', 'm-1', {
      decision: 'approve',
      criteriaConfirmed: true,
    });

    expect(prisma.milestoneReview.create.mock.calls[0][0].data).toMatchObject({
      milestoneId: 'm-1',
      round: 2,
      decision: 'approved',
      criteriaConfirmed: true,
      reviewerName: 'Ada',
      clientPortalUserId: 'pu-1',
    });
    expect(milestones.update).toHaveBeenCalledWith('owner-1', 'm-1', {
      status: 'accepted',
      acceptedBy: 'Ada <ada@griid.test>',
    });
    expect(events.emit).toHaveBeenCalledWith(
      'milestone.reviewed',
      expect.objectContaining({ approved: true, round: 2, ownerId: 'owner-1' }),
    );
  });

  it('requests changes with feedback and sends the milestone back to in progress', async () => {
    await service.review('portal-1', 'pu-1', 'p-1', 'm-1', {
      decision: 'request_changes',
      comments: [
        { deliverableId: 'd1', body: '  Checkout times out  ' },
        { body: 'Also the icon is blurry' },
      ],
    });

    expect(prisma.milestoneReview.create.mock.calls[0][0].data.comments).toEqual([
      { deliverableId: 'd1', body: 'Checkout times out' },
      { deliverableId: null, body: 'Also the icon is blurry' },
    ]);
    expect(milestones.update).toHaveBeenCalledWith('owner-1', 'm-1', { status: 'in_progress' });
  });

  it('needs at least one note to request changes', async () => {
    await expect(
      service.review('portal-1', 'pu-1', 'p-1', 'm-1', { decision: 'request_changes', comments: [{ body: '  ' }] }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.milestoneReview.create).not.toHaveBeenCalled();
  });

  it('needs the acceptance criteria confirmed to approve', async () => {
    await expect(
      service.review('portal-1', 'pu-1', 'p-1', 'm-1', { decision: 'approve' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects feedback about a deliverable that is not on the milestone', async () => {
    await expect(
      service.review('portal-1', 'pu-1', 'p-1', 'm-1', {
        decision: 'request_changes',
        comments: [{ deliverableId: 'nope', body: 'x' }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses users without approval rights', async () => {
    prisma.clientPortalUser.findUnique.mockResolvedValue({ name: 'Viewer', email: 'v@x', canApproveMilestones: false });
    await expect(
      service.review('portal-1', 'pu-1', 'p-1', 'm-1', { decision: 'approve', criteriaConfirmed: true }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('only answers milestones that are waiting for review', async () => {
    prisma.milestone.findFirst.mockResolvedValue(milestone({ status: 'in_progress' }));
    await expect(
      service.review('portal-1', 'pu-1', 'p-1', 'm-1', { decision: 'approve', criteriaConfirmed: true }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("404s a project the user can't see", async () => {
    context.sharedProjectIds.mockResolvedValue([]);
    await expect(
      service.review('portal-1', 'pu-1', 'p-1', 'm-1', { decision: 'approve', criteriaConfirmed: true }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('drops the round again if the sign-off itself fails', async () => {
    milestones.update.mockRejectedValue(new Error('db down'));
    await expect(
      service.review('portal-1', 'pu-1', 'p-1', 'm-1', { decision: 'approve', criteriaConfirmed: true }),
    ).rejects.toThrow('db down');
    expect(prisma.milestoneReview.delete).toHaveBeenCalledWith({ where: { id: 'r-2' } });
    expect(events.emit).not.toHaveBeenCalled();
  });
});
