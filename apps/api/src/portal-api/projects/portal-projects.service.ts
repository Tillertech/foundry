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

/** Client-facing subset - no internal notes or effort estimates. */
interface PortalMilestone {
  id: string;
  name: string;
  description: string | null;
  status: MilestoneStatus;
  dueDate: Date | null;
  completedAt: Date | null;
  order: number;
}

type PortalProject = Omit<Project, 'notes'> & {
  milestones: PortalMilestone[];
};

/**
 * Prisma objects returned from a controller serialize every field (no
 * ClassSerializerInterceptor stripping in this codebase), so this narrows
 * with `select`, not just `include`, to keep notes/estimatedHours - internal
 * capacity-planning detail - out of the portal response. The project's own
 * internal `notes` are dropped the same way, via PROJECT_OMIT.
 */
const MILESTONES_INCLUDE = {
  milestones: {
    orderBy: { order: 'asc' as const },
    select: {
      id: true,
      name: true,
      description: true,
      status: true,
      dueDate: true,
      completedAt: true,
      order: true,
    },
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
    query: PaginationQueryDto,
    baseUrl: string,
  ): Promise<PaginationRes<PortalProject>> {
    await this.context.require(clientPortalId, 'viewProjects');
    const projectIds = await this.context.sharedProjectIds(clientPortalId);
    return this.pagination.paginate<PortalProject>(
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
  }

  async findOne(clientPortalId: string, id: string): Promise<PortalProject> {
    await this.context.require(clientPortalId, 'viewProjects');
    const projectIds = await this.context.sharedProjectIds(clientPortalId);
    if (!projectIds.includes(id)) {
      throw new NotFoundException('Project not found');
    }
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: MILESTONES_INCLUDE,
      omit: PROJECT_OMIT,
    });
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }
}
