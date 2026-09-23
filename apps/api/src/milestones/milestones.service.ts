import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { MilestoneStatus } from '../generated/prisma/enums';
import type { MilestoneModel as Milestone } from '../generated/prisma/models';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';
import { CreateMilestoneDto } from './dto/create-milestone.dto';
import { ReorderMilestonesDto } from './dto/reorder-milestones.dto';
import { UpdateMilestoneDto } from './dto/update-milestone.dto';
import { ProjectMilestonesSummaryEntity } from './entities/project-milestones-summary.entity';

@Injectable()
export class MilestonesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projects: ProjectsService,
  ) {}

  private scope(ownerId: string) {
    return { project: { client: { workspace: { ownerId } } } };
  }

  async create(ownerId: string, dto: CreateMilestoneDto): Promise<Milestone> {
    await this.projects.findOne(ownerId, dto.projectId);
    const order = dto.order ?? (await this.nextOrder(dto.projectId));
    return this.prisma.milestone.create({ data: { ...dto, order } });
  }

  /** Every milestone for a project, ordered by its manual position - a bounded, reorderable list rather than a paginated feed. */
  async findAllForProject(
    ownerId: string,
    projectId: string,
  ): Promise<Milestone[]> {
    await this.projects.findOne(ownerId, projectId);
    return this.prisma.milestone.findMany({
      where: { projectId },
      orderBy: { order: 'asc' },
    });
  }

  async findOne(ownerId: string, id: string): Promise<Milestone> {
    const milestone = await this.prisma.milestone.findFirst({
      where: { id, ...this.scope(ownerId) },
    });
    if (!milestone) throw new NotFoundException('Milestone not found');
    return milestone;
  }

  async update(
    ownerId: string,
    id: string,
    dto: UpdateMilestoneDto,
  ): Promise<Milestone> {
    const existing = await this.findOne(ownerId, id);
    const data: UpdateMilestoneDto & { completedAt?: Date | null } = { ...dto };

    // Completion date tracks the status transition rather than being
    // client-settable directly: entering `completed` stamps it (unless
    // already set by an earlier completion), leaving it clears it.
    if (dto.status && dto.status !== existing.status) {
      data.completedAt =
        dto.status === MilestoneStatus.completed
          ? (existing.completedAt ?? new Date())
          : null;
    }

    return this.prisma.milestone.update({ where: { id }, data });
  }

  async remove(ownerId: string, id: string): Promise<Milestone> {
    await this.findOne(ownerId, id);
    return this.prisma.milestone.delete({ where: { id } });
  }

  /** Persists a full reordering of a project's milestones in one transaction. */
  async reorder(
    ownerId: string,
    dto: ReorderMilestonesDto,
  ): Promise<Milestone[]> {
    await this.projects.findOne(ownerId, dto.projectId);
    const current = await this.prisma.milestone.findMany({
      where: { projectId: dto.projectId },
      select: { id: true },
    });
    const currentIds = new Set(current.map((m) => m.id));
    const sameSet =
      dto.ids.length === currentIds.size &&
      dto.ids.every((id) => currentIds.has(id));
    if (!sameSet) {
      throw new BadRequestException(
        "ids must match the project's current milestone set exactly",
      );
    }

    await this.prisma.$transaction(
      dto.ids.map((id, order) =>
        this.prisma.milestone.update({ where: { id }, data: { order } }),
      ),
    );
    return this.prisma.milestone.findMany({
      where: { projectId: dto.projectId },
      orderBy: { order: 'asc' },
    });
  }

  /**
   * Progress summary per project, for the listing page's project cards - one
   * query for the whole visible page rather than one per card. Projects the
   * caller doesn't own are silently dropped rather than rejected.
   */
  async summaryForProjects(
    ownerId: string,
    projectIds: string[],
  ): Promise<ProjectMilestonesSummaryEntity[]> {
    const milestones = await this.prisma.milestone.findMany({
      where: {
        projectId: { in: projectIds },
        status: { not: MilestoneStatus.cancelled },
        ...this.scope(ownerId),
      },
      select: { projectId: true, status: true, name: true },
    });

    const byProject = new Map<string, typeof milestones>();
    for (const m of milestones) {
      byProject.set(m.projectId, [...(byProject.get(m.projectId) ?? []), m]);
    }

    return projectIds.map((projectId) => {
      const items = byProject.get(projectId) ?? [];
      const completed = items.filter(
        (m) => m.status === MilestoneStatus.completed,
      ).length;
      return {
        projectId,
        total: items.length,
        completed,
        progress: items.length
          ? Math.round((completed / items.length) * 100)
          : null,
        currentMilestoneName:
          items.find((m) => m.status === MilestoneStatus.in_progress)?.name ??
          null,
      };
    });
  }

  private async nextOrder(projectId: string): Promise<number> {
    const last = await this.prisma.milestone.findFirst({
      where: { projectId },
      orderBy: { order: 'desc' },
      select: { order: true },
    });
    return (last?.order ?? -1) + 1;
  }
}
