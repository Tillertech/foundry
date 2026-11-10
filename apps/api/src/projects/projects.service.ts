import { Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ClientsService } from '../clients/clients.service';
import {
  PaginationRes,
  PaginationService,
} from '../common/pagination/pagination.service';
import {
  ProjectEvents,
  type OwnedRecordEvent,
  type ProjectMovedEvent,
} from '../common/events';
import type { Prisma } from '../generated/prisma/client';
import type { ProjectModel as Project } from '../generated/prisma/models';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { ListProjectsQueryDto } from './dto/list-projects-query.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { WorkspaceScope } from '../common/workspace-scope/workspace-scope';

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pagination: PaginationService,
    private readonly clients: ClientsService,
    private readonly events: EventEmitter2,
    private readonly workspaceScope: WorkspaceScope,
  ) {}

  async create(ownerId: string, dto: CreateProjectDto): Promise<Project> {
    const client = await this.clients.findOne(ownerId, dto.clientId);
    const project = await this.insert(this.prisma, dto);
    this.announceCreated(ownerId, client.workspaceId, project.id);
    return project;
  }

  /**
   * Writes the project row through `db` (the client or an open transaction),
   * for callers composing a larger atomic write such as quote conversion.
   * The caller must already have checked the client belongs to the owner,
   * and calls announceCreated() once the transaction has committed.
   */
  async insert(
    db: Prisma.TransactionClient,
    dto: CreateProjectDto,
  ): Promise<Project> {
    // If this client already has a portal, share the new project into it by
    // default - otherwise it silently never shows up until someone manually
    // toggles it on, which defeats the "portal reflects reality" point.
    const portal = await db.clientPortal.findUnique({
      where: { clientId: dto.clientId },
      select: { id: true },
    });
    return db.project.create({
      data: {
        ...dto,
        ...(portal
          ? { clientPortalProjects: { create: { clientPortalId: portal.id } } }
          : {}),
      },
    });
  }

  announceCreated(ownerId: string, workspaceId: string, id: string): void {
    this.events.emit(ProjectEvents.CREATED, {
      id,
      ownerId,
      workspaceId,
    } satisfies OwnedRecordEvent);
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
          client: { workspace: this.workspaceScope.owned(ownerId) },
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
    const moving = !!dto.clientId && dto.clientId !== existing.clientId;
    const fromWorkspaceId = moving
      ? (await this.clients.findOne(ownerId, existing.clientId)).workspaceId
      : null;
    const project = moving
      ? await this.reassignClient(ownerId, id, dto.clientId as string, dto)
      : await this.prisma.project.update({ where: { id }, data: dto });

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

    if (fromWorkspaceId) {
      const to = await this.clients.findOne(ownerId, project.clientId);
      this.events.emit(ProjectEvents.MOVED, {
        id,
        ownerId,
        workspaceId: to.workspaceId,
        fromWorkspaceId,
      } satisfies ProjectMovedEvent);
    }

    return project;
  }

  /**
   * Moves a project to another of the caller's clients, keeping everything
   * that hangs off the client relationship consistent in one transaction:
   *  - it's unshared from the old client's portal (otherwise that client's
   *    portal users keep seeing it and its milestones),
   *  - shared into the new client's portal if there is one, as create() does,
   *  - its expenses and documents follow it into the new client's
   *    workspace, which may be a different one of the caller's workspaces,
   *  - and documents filed under the old client on this project are refiled
   *    under the new one (the old client's portal would otherwise still list
   *    them through their client link).
   */
  private async reassignClient(
    ownerId: string,
    id: string,
    clientId: string,
    dto: UpdateProjectDto,
  ): Promise<Project> {
    const client = await this.clients.findOne(ownerId, clientId);
    const portal = await this.prisma.clientPortal.findUnique({
      where: { clientId },
      select: { id: true },
    });
    return this.prisma.$transaction(async (tx) => {
      await tx.clientPortalProject.deleteMany({
        where: { projectId: id, clientPortal: { clientId: { not: clientId } } },
      });
      if (portal) {
        await tx.clientPortalProject.upsert({
          where: {
            clientPortalId_projectId: {
              clientPortalId: portal.id,
              projectId: id,
            },
          },
          create: { clientPortalId: portal.id, projectId: id },
          update: {},
        });
      }
      await tx.expense.updateMany({
        where: { projectId: id },
        data: { workspaceId: client.workspaceId },
      });
      await tx.document.updateMany({
        where: { projectId: id, clientId: { not: null } },
        data: { clientId, workspaceId: client.workspaceId },
      });
      await tx.document.updateMany({
        where: { projectId: id, clientId: null },
        data: { workspaceId: client.workspaceId },
      });
      return tx.project.update({ where: { id }, data: dto });
    });
  }

  async remove(ownerId: string, id: string): Promise<Project> {
    const project = await this.findOne(ownerId, id);
    const client = await this.clients.findOne(ownerId, project.clientId);
    const deleted = await this.prisma.project.delete({ where: { id } });
    this.events.emit(ProjectEvents.DELETED, {
      id,
      ownerId,
      workspaceId: client.workspaceId,
    } satisfies OwnedRecordEvent);
    return deleted;
  }
}
