import { Injectable, NotFoundException } from '@nestjs/common';
import {
  PaginationRes,
  PaginationService,
} from '../../common/pagination/pagination.service';
import type { ProjectModel as Project } from '../../generated/prisma/models';
import { MilestoneStatus } from '../../generated/prisma/enums';
import { PrismaService } from '../../prisma/prisma.service';
import { PortalContextService } from '../portal-context.service';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

/** Client-facing subset - no internal notes, effort estimates or billing. */
interface PortalMilestone {
  id: string;
  name: string;
  description: string | null;
  status: MilestoneStatus;
  dueDate: Date | null;
  completedAt: Date | null;
  order: number;
  /** Json column: [{ id, label, done }]. */
  deliverables: unknown;
  acceptanceCriteria: string | null;
  deliveredAt: Date | null;
  acceptedAt: Date | null;
  /** Review rounds, oldest first. */
  reviews: {
    id: string;
    round: number;
    decision: string;
    comments: unknown;
    criteriaConfirmed: boolean;
    reviewerName: string;
    createdAt: Date;
  }[];
  /** Price - only when the portal shows payments (null otherwise), for the sign-off consequence. */
  amount: unknown;
  billingTrigger: string | null;
  releasesRetention: boolean;
}

type PortalProject = Omit<Project, 'notes'> & {
  milestones: PortalMilestone[];
  /** Detail reads only. */
  quote?: { id: string; number: string } | null;
};

/**
 * Prisma objects returned from a controller serialize every field (no
 * ClassSerializerInterceptor stripping in this codebase), so this narrows
 * with `select`, not just `include`, to keep notes/estimatedHours - internal
 * capacity-planning detail - and billing (amount, invoice, retention) out of
 * the portal response. The project's own
 * internal `notes` are dropped the same way, via PROJECT_OMIT.
 *
 * Shared by the project read and the single-milestone read.
 */
const PORTAL_MILESTONE_SELECT = {
  id: true,
  name: true,
  description: true,
  status: true,
  dueDate: true,
  completedAt: true,
  order: true,
  // Client-facing delivery detail: what's being handed over, how far
  // along it is, and when it was delivered / signed off.
  deliverables: true,
  acceptanceCriteria: true,
  deliveredAt: true,
  acceptedAt: true,
  reviews: {
    orderBy: { round: 'asc' as const },
    select: {
      id: true,
      round: true,
      decision: true,
      comments: true,
      criteriaConfirmed: true,
      reviewerName: true,
      createdAt: true,
    },
  },
  // Billing, masked by withBilling() unless the portal shows payments.
  amount: true,
  billingTrigger: true,
  releasesRetention: true,
};

/**
 * The milestone's price tells a reviewer what approving it bills - but only
 * portals that show payments may see money. Everyone else gets it blanked.
 */
function withBilling<T extends PortalMilestone>(m: T, showBilling: boolean): T {
  return showBilling
    ? m
    : { ...m, amount: null, billingTrigger: null, releasesRetention: false };
}

const MILESTONES_INCLUDE = {
  milestones: {
    orderBy: { order: 'asc' as const },
    select: PORTAL_MILESTONE_SELECT,
  },
};

const PROJECT_OMIT = { notes: true as const };

@Injectable()
export class PortalProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pagination: PaginationService,
    private readonly context: PortalContextService,
  ) {}

  async findAll(
    clientPortalId: string,
    portalUserId: string,
    query: PaginationQueryDto,
    baseUrl: string,
  ): Promise<PaginationRes<PortalProject>> {
    const { permission } = await this.context.require(clientPortalId, 'viewProjects');
    const projectIds = await this.context.sharedProjectIds(
      clientPortalId,
      portalUserId,
    );
    const page = await this.pagination.paginate<PortalProject>(
      this.prisma.project,
      {
        where: { id: { in: projectIds } },
        include: MILESTONES_INCLUDE,
        omit: PROJECT_OMIT,
      },
      {
        cursor: query.cursor,
        take: query.take,
        orderBy: { startDate: 'desc' },
        baseUrl,
        includeCount: true,
      },
    );
    return {
      ...page,
      results: page.results.map((p) => ({
        ...p,
        milestones: p.milestones.map((m) => withBilling(m, permission.viewPayments)),
      })),
    };
  }

  async findOne(
    clientPortalId: string,
    portalUserId: string,
    id: string,
  ): Promise<PortalProject> {
    const { permission } = await this.context.require(clientPortalId, 'viewProjects');
    const projectIds = await this.context.sharedProjectIds(
      clientPortalId,
      portalUserId,
    );
    if (!projectIds.includes(id)) {
      throw new NotFoundException('Project not found');
    }
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: {
        ...MILESTONES_INCLUDE,
        // The quote the client accepted for this project - just its
        // reference, for "from quote Q-2001" in the header.
        quote: { select: { id: true, number: true } },
      },
      omit: PROJECT_OMIT,
    });
    if (!project) throw new NotFoundException('Project not found');
    return {
      ...project,
      milestones: project.milestones.map((m) => withBilling(m, permission.viewPayments)),
    };
  }

  /**
   * One milestone of a shared project, for live updates: the portal swaps
   * just the changed milestone instead of refetching the whole project.
   * Same access rules as findOne; 404 once it is gone or out of reach.
   */
  async findMilestone(
    clientPortalId: string,
    portalUserId: string,
    projectId: string,
    milestoneId: string,
  ): Promise<PortalMilestone> {
    const { permission } = await this.context.require(clientPortalId, 'viewProjects');
    const projectIds = await this.context.sharedProjectIds(
      clientPortalId,
      portalUserId,
    );
    if (!projectIds.includes(projectId)) {
      throw new NotFoundException('Project not found');
    }
    const milestone = await this.prisma.milestone.findFirst({
      where: { id: milestoneId, projectId },
      select: PORTAL_MILESTONE_SELECT,
    });
    if (!milestone) throw new NotFoundException('Milestone not found');
    return withBilling(milestone, permission.viewPayments);
  }
}
