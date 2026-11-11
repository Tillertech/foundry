import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MilestoneEvents, type MilestoneChangedEvent } from '../common/events';
import type { Prisma } from '../generated/prisma/client';
import {
  InvoiceStatus,
  MilestoneBillingTrigger,
  MilestoneStatus,
} from '../generated/prisma/enums';
import type { MilestoneModel } from '../generated/prisma/models';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';
import { CreateMilestoneDto } from './dto/create-milestone.dto';
import { ReorderMilestonesDto } from './dto/reorder-milestones.dto';
import { UpdateMilestoneDto } from './dto/update-milestone.dto';
import { ProjectMilestonesSummaryEntity } from './entities/project-milestones-summary.entity';
import { MilestoneBillingService } from './milestone-billing.service';

/** Every milestone read/write carries a summary of the invoice that bills it. */
export const MILESTONE_INCLUDE = {
  invoice: { select: { id: true, number: true, status: true } },
  reviews: {
    orderBy: { round: 'asc' as const },
    omit: { clientPortalUserId: true, milestoneId: true },
  },
} as const;

export type Milestone = Prisma.MilestoneGetPayload<{
  include: typeof MILESTONE_INCLUDE;
}>;

/** Statuses that count as finished work (completed for unpriced, accepted for signed-off). */
const DONE: MilestoneStatus[] = [MilestoneStatus.completed, MilestoneStatus.accepted];
const isDone = (s: MilestoneStatus) => DONE.includes(s);
/** Statuses at or past hand-over. */
const HANDED_OVER: MilestoneStatus[] = [
  MilestoneStatus.delivered,
  MilestoneStatus.accepted,
  MilestoneStatus.completed,
];

type MilestoneWrite = Omit<UpdateMilestoneDto, 'deliverables'> & {
  deliverables?: Prisma.InputJsonValue;
  completedAt?: Date | null;
  deliveredAt?: Date | null;
  acceptedAt?: Date | null;
  acceptedBy?: string | null;
};

@Injectable()
export class MilestonesService {
  private readonly logger = new Logger(MilestonesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly projects: ProjectsService,
    private readonly events: EventEmitter2,
    private readonly billing: MilestoneBillingService,
  ) {}

  private scope(ownerId: string) {
    return { project: { client: { workspace: { ownerId } } } };
  }

  async create(ownerId: string, dto: CreateMilestoneDto): Promise<Milestone> {
    const project = await this.projects.findOne(ownerId, dto.projectId);
    if (dto.deliverables) await this.assertEvidence(project, dto.deliverables);
    const order = dto.order ?? (await this.nextOrder(dto.projectId));
    const { deliverables, ...rest } = dto;
    const created = await this.prisma.milestone.create({
      data: {
        ...rest,
        order,
        ...(deliverables ? { deliverables: plainDeliverables(deliverables) } : {}),
        // Same rule as update(): a milestone recorded as already done is
        // stamped now, so the dates never disagree with the status.
        ...(dto.status ? setStamps(statusStamps(dto.status, null)) : {}),
      },
      include: MILESTONE_INCLUDE,
    });
    this.changed({
      projectId: created.projectId,
      milestoneId: created.id,
      name: created.name,
      status: created.status,
      previousStatus: null,
    });
    return created;
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
      include: MILESTONE_INCLUDE,
    });
  }

  async findOne(ownerId: string, id: string): Promise<Milestone> {
    const milestone = await this.prisma.milestone.findFirst({
      where: { id, ...this.scope(ownerId) },
      include: MILESTONE_INCLUDE,
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
    const { deliverables, ...fields } = dto;
    const data: MilestoneWrite = { ...fields };
    if (deliverables) {
      const project = await this.projects.findOne(ownerId, existing.projectId);
      await this.assertEvidence(project, deliverables);
      data.deliverables = plainDeliverables(deliverables);
    }

    // Dates track status transitions rather than being client-settable
    // directly: entering a state stamps it (keeping an earlier stamp),
    // stepping back clears it.
    if (dto.status && dto.status !== existing.status) {
      Object.assign(data, statusStamps(dto.status, existing));
      if (dto.status !== MilestoneStatus.accepted && dto.acceptedBy === undefined) {
        data.acceptedBy = null;
      }
    }

    let milestone = await this.prisma.milestone.update({
      where: { id },
      data,
      include: MILESTONE_INCLUDE,
    });

    const enteredAccepted =
      dto.status === MilestoneStatus.accepted &&
      existing.status !== MilestoneStatus.accepted;
    if (
      enteredAccepted &&
      !milestone.invoice &&
      Number(milestone.amount ?? 0) > 0 &&
      milestone.billingTrigger === MilestoneBillingTrigger.on_acceptance
    ) {
      // Sign-off is the billing trigger. A failed invoice must not undo the
      // sign-off itself: the owner can raise it by hand from the milestone.
      try {
        await this.billing.invoice(ownerId, id);
        // Re-read: billing also wrote the retention held on this milestone.
        milestone = await this.findOne(ownerId, id);
      } catch (err) {
        this.logger.warn(
          `Milestone ${id} accepted but its invoice could not be raised: ${String(err)}`,
        );
      }
    }

    this.changed({
      projectId: milestone.projectId,
      milestoneId: milestone.id,
      name: milestone.name,
      ...(dto.status && dto.status !== existing.status
        ? { status: dto.status, previousStatus: existing.status }
        : {}),
    });

    if (dto.status && isDone(dto.status) && !isDone(existing.status)) {
      const project = await this.prisma.project.findUnique({
        where: { id: milestone.projectId },
        include: { client: true },
      });
      if (project) {
        const { client, ...rest } = project;
        this.events.emit(MilestoneEvents.COMPLETED, {
          milestone,
          project: rest,
          client,
        });
      }
    }

    return milestone;
  }

  /** Raises the draft invoice for a priced milestone by hand (manual/upfront billing, or a retry). */
  async raiseInvoice(ownerId: string, id: string): Promise<Milestone> {
    await this.billing.invoice(ownerId, id);
    return this.findOne(ownerId, id);
  }

  /**
   * Evidence files must be documents the client can be shown for this
   * project: filed on the project itself or on its client.
   */
  private async assertEvidence(
    project: { id: string; clientId: string },
    deliverables: { documentIds?: string[] }[],
  ): Promise<void> {
    const ids = [...new Set(deliverables.flatMap((d) => d.documentIds ?? []))];
    if (!ids.length) return;
    const found = await this.prisma.document.count({
      where: {
        id: { in: ids },
        OR: [{ projectId: project.id }, { clientId: project.clientId, projectId: null }],
      },
    });
    if (found !== ids.length) {
      throw new BadRequestException(
        "Evidence files must be documents of this project or its client",
      );
    }
  }

  /** Live-view signal (client portal); never carries billing detail. */
  private changed(event: MilestoneChangedEvent): void {
    this.events.emit(MilestoneEvents.CHANGED, event);
  }

  async remove(ownerId: string, id: string): Promise<Milestone> {
    await this.findOne(ownerId, id);
    const removed = await this.prisma.milestone.delete({
      where: { id },
      include: MILESTONE_INCLUDE,
    });
    this.changed({
      projectId: removed.projectId,
      milestoneId: removed.id,
      name: removed.name,
      removed: true,
    });
    return removed;
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
    // Distinct as well as same length - otherwise [a, a, b] would pass
    // against {a, b, c}, leaving c with a stale position.
    const sameSet =
      new Set(dto.ids).size === dto.ids.length &&
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
    const reordered = await this.prisma.milestone.findMany({
      where: { projectId: dto.projectId },
      orderBy: { order: 'asc' },
      include: MILESTONE_INCLUDE,
    });
    this.changed({ projectId: dto.projectId, milestoneId: null, name: null });
    return reordered;
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
      const completed = items.filter((m) => isDone(m.status)).length;
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

/** Strips class-transformer instances down to JSON for the deliverables column. */
function plainDeliverables(
  list: {
    id: string;
    label: string;
    done: boolean;
    note?: string;
    links?: { label: string; url: string }[];
    documentIds?: string[];
  }[],
): Prisma.InputJsonValue {
  return list.map(({ id, label, done, note, links, documentIds }) => ({
    id,
    label,
    done,
    ...(note?.trim() ? { note: note.trim() } : {}),
    ...(links?.length ? { links: links.map(({ label: l, url }) => ({ label: l, url })) } : {}),
    ...(documentIds?.length ? { documentIds: [...new Set(documentIds)] } : {}),
  }));
}

/**
 * Date stamps implied by moving into `next` from `prev` (null on create):
 * completedAt for done states, deliveredAt from hand-over on, acceptedAt
 * for sign-off. Earlier stamps are kept; leaving a state clears its stamp.
 */
function statusStamps(
  next: MilestoneStatus,
  prev: Pick<MilestoneModel, 'completedAt' | 'deliveredAt' | 'acceptedAt'> | null,
): Pick<MilestoneWrite, 'completedAt' | 'deliveredAt' | 'acceptedAt'> {
  const now = new Date();
  return {
    completedAt: isDone(next) ? (prev?.completedAt ?? now) : null,
    deliveredAt: HANDED_OVER.includes(next) ? (prev?.deliveredAt ?? now) : null,
    acceptedAt:
      next === MilestoneStatus.accepted ? (prev?.acceptedAt ?? now) : null,
  };
}

/** Only the stamps that apply - a new row has nothing to clear. */
function setStamps<T extends Record<string, Date | null>>(stamps: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(stamps).filter(([, v]) => v !== null),
  ) as Partial<T>;
}
