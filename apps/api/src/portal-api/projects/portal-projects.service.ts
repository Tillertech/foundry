import { Injectable, NotFoundException } from '@nestjs/common';
import {
  PaginationRes,
  PaginationService,
} from '../../common/pagination/pagination.service';
import type { ProjectModel as Project } from '../../generated/prisma/models';
import { PrismaService } from '../../prisma/prisma.service';
import { PortalContextService } from '../portal-context.service';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

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
  ): Promise<PaginationRes<Project>> {
    await this.context.require(clientPortalId, 'viewProjects');
    const projectIds = await this.context.sharedProjectIds(clientPortalId);
    return this.pagination.paginate<Project>(
      this.prisma.project,
      { where: { id: { in: projectIds } } },
      {
        cursor: query.cursor,
        take: query.take,
        orderBy: { startDate: 'desc' },
        baseUrl,
        includeCount: true,
      },
    );
  }

  async findOne(clientPortalId: string, id: string): Promise<Project> {
    await this.context.require(clientPortalId, 'viewProjects');
    const projectIds = await this.context.sharedProjectIds(clientPortalId);
    if (!projectIds.includes(id)) {
      throw new NotFoundException('Project not found');
    }
    const project = await this.prisma.project.findUnique({ where: { id } });
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }
}
