import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '../../generated/prisma/client';
import {
  MilestoneReviewDecision,
  MilestoneStatus,
} from '../../generated/prisma/enums';
import { MilestoneEvents, type MilestoneReviewedEvent } from '../../common/events';
import { MilestonesService } from '../../milestones/milestones.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PortalContextService } from '../portal-context.service';
import { ReviewMilestoneDto } from './dto/review-milestone.dto';

/**
 * The client's answer to a delivered milestone. One decision per round:
 * approve (signs the milestone off through the same path as the owner's
 * sign-off - dates, draft invoice, notifications) or request changes (back
 * to in progress with the feedback). Each answer is kept as a numbered
 * round so both sides see the history.
 */
@Injectable()
export class PortalMilestoneReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: PortalContextService,
    private readonly milestones: MilestonesService,
    private readonly events: EventEmitter2,
  ) {}

  async review(
    clientPortalId: string,
    portalUserId: string,
    projectId: string,
    milestoneId: string,
    dto: ReviewMilestoneDto,
  ): Promise<void> {
    await this.context.require(clientPortalId, 'viewProjects');
    const visible = await this.context.sharedProjectIds(clientPortalId, portalUserId);
    if (!visible.includes(projectId)) throw new NotFoundException('Project not found');

    const user = await this.prisma.clientPortalUser.findUnique({
      where: { id: portalUserId },
      select: { name: true, email: true, canApproveMilestones: true },
    });
    if (!user) throw new NotFoundException('Portal user not found');
    if (!user.canApproveMilestones) {
      throw new ForbiddenException(
        "You can view this project but not approve its milestones - ask your team's approver",
      );
    }

    const milestone = await this.prisma.milestone.findFirst({
      where: { id: milestoneId, projectId },
      select: {
        id: true,
        name: true,
        status: true,
        deliverables: true,
        acceptanceCriteria: true,
        project: {
          select: { name: true, client: { select: { workspace: { select: { ownerId: true } } } } },
        },
        _count: { select: { reviews: true } },
      },
    });
    if (!milestone) throw new NotFoundException('Milestone not found');
    if (milestone.status !== MilestoneStatus.delivered) {
      throw new ConflictException('This milestone is not waiting for your review');
    }

    const approve = dto.decision === 'approve';
    const deliverableIds = new Set(
      (Array.isArray(milestone.deliverables) ? milestone.deliverables : [])
        .map((d) => (d && typeof d === 'object' && 'id' in d ? String(d.id) : null))
        .filter((x): x is string => !!x),
    );
    const comments = (dto.comments ?? [])
      .map((c) => ({ deliverableId: c.deliverableId ?? null, body: c.body.trim() }))
      .filter((c) => c.body);
    for (const c of comments) {
      if (c.deliverableId && !deliverableIds.has(c.deliverableId)) {
        throw new BadRequestException('Feedback refers to a deliverable that is not on this milestone');
      }
    }
    if (!approve && comments.length === 0) {
      throw new BadRequestException('Say what needs to change so the team can act on it');
    }
    if (approve && milestone.acceptanceCriteria?.trim() && !dto.criteriaConfirmed) {
      throw new BadRequestException('Confirm the acceptance criteria are met before approving');
    }

    const ownerId = milestone.project.client.workspace.ownerId;
    const round = milestone._count.reviews + 1;
    let reviewId: string;
    try {
      // The (milestone, round) unique index turns a double submit into a 409.
      const review = await this.prisma.milestoneReview.create({
        data: {
          milestoneId,
          round,
          decision: approve
            ? MilestoneReviewDecision.approved
            : MilestoneReviewDecision.changes_requested,
          comments,
          criteriaConfirmed: !!dto.criteriaConfirmed,
          reviewerName: user.name,
          reviewerEmail: user.email,
          clientPortalUserId: portalUserId,
        },
      });
      reviewId = review.id;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('This milestone was just reviewed');
      }
      throw err;
    }

    try {
      // Same path as the owner's own sign-off / reopen: stamps dates,
      // raises the draft invoice on approval, fires the usual events.
      await this.milestones.update(
        ownerId,
        milestoneId,
        approve
          ? { status: MilestoneStatus.accepted, acceptedBy: `${user.name} <${user.email}>` }
          : { status: MilestoneStatus.in_progress },
      );
    } catch (err) {
      // Keep the round history honest: no decision without its effect.
      await this.prisma.milestoneReview.delete({ where: { id: reviewId } }).catch(() => undefined);
      throw err;
    }

    this.events.emit(MilestoneEvents.REVIEWED, {
      ownerId,
      projectId,
      projectName: milestone.project.name,
      milestoneId,
      milestoneName: milestone.name,
      round,
      approved: approve,
      reviewerName: user.name,
      commentCount: comments.length,
    } satisfies MilestoneReviewedEvent);
  }
}
