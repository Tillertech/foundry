import { Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ClientsService } from '../clients/clients.service';
import {
  PaginationRes,
  PaginationService,
} from '../common/pagination/pagination.service';
import { ProjectEvents } from '../common/events';
import type { ProjectModel as Project } from '../generated/prisma/models';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { ListProjectsQueryDto } from './dto/list-projects-query.dto';
import { UpdateProjectDto } from './dto/update-project.dto';

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pagination: PaginationService,
    private readonly clients: ClientsService,
    private readonly events: EventEmitter2,
  ) {}

  async create(ownerId: string, dto: CreateProjectDto): Promise<Project> {
    await this.clients.findOne(ownerId, dto.clientId);
    // If this client already has a portal, share the new project into it by
    // default - otherwise it silently never shows up until someone manually
    // toggles it on, which defeats the "portal reflects reality" point.
    const portal = await this.prisma.clientPortal.findUnique({
      where: { clientId: dto.clientId },
      select: { id: true },
    });
    return this.prisma.project.create({
      data: {
        ...dto,
        ...(portal
          ? { clientPortalProjects: { create: { clientPortalId: portal.id } } }
          : {}),
      },
    });
  }

  findAll(
    ownerId: string,
    query: ListProjectsQueryDto,
    baseUrl: string,
  ): Promise<PaginationRes<Project>> {
    const { cursor, take, clientId, status } = query;
    return this.pagination.paginate<Project>(
      this.prisma.project,
      {
        where: {
          client: { workspace: { ownerId } },
          ...(clientId ? { clientId } : {}),
          ...(status ? { status } : {}),
        },
      },
      {
        cursor,
        take,
        orderBy: { startDate: 'desc' },
        baseUrl,
        includeCount: true,
      },
    );
  }

  async findOne(ownerId: string, id: string): Promise<Project> {
    const project = await this.prisma.project.findFirst({
      where: { id, client: { workspace: { ownerId } } },
    });
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }

  async update(
    ownerId: string,
    id: string,
    dto: UpdateProjectDto,
  ): Promise<Project> {
    const existing = await this.findOne(ownerId, id);
    const project = await this.prisma.project.update({ where: { id }, data: dto });

    if (dto.status && dto.status !== existing.status) {
      const client = await this.prisma.client.findUnique({
        where: { id: project.clientId },
      });
      if (client) {
        this.events.emit(ProjectEvents.STATUS_CHANGED, {
          project,
          previousStatus: existing.status,
          client,
        });
      }
    }

    return project;
  }

  async remove(ownerId: string, id: string): Promise<Project> {
    await this.findOne(ownerId, id);
    return this.prisma.project.delete({ where: { id } });
  }
}
