import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ClientsService } from '../clients/clients.service';
import { QuoteEvents, type QuoteChangedEvent } from '../common/events';
import {
  PaginationRes,
  PaginationService,
} from '../common/pagination/pagination.service';
import {
  MilestoneBillingTrigger,
  QuoteItemKind,
  QuoteStatus,
} from '../generated/prisma/enums';
import type {
  QuoteModel as Quote,
  QuoteItemModel as QuoteItem,
} from '../generated/prisma/models';
import type { Prisma } from '../generated/prisma/client';
import { MilestoneBillingService } from '../milestones/milestone-billing.service';
import { NotificationService } from '../notification/notification.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';
import { ConvertQuoteDto } from './dto/convert-quote.dto';
import { CreateQuoteDto } from './dto/create-quote.dto';
import { QuoteLineItemDto } from './dto/quote-line-item.dto';
import { QuoteConversionEntity } from './entities/quote-conversion.entity';
import { milestoneSchedule, quoteTotals } from './quote-totals';
import { ListQuotesQueryDto } from './dto/list-quotes-query.dto';
import { UpdateQuoteDto } from './dto/update-quote.dto';
import { MB, QUOTE_ATTACHMENTS_MAX_BYTES } from '../common/http/upload-limits';
import { WorkspaceScope } from '../common/workspace-scope/workspace-scope';

export type QuoteAttachmentRow = {
  position: number;
  document: { id: string; name: string; mimeType: string | null; size: number };
};
export type QuoteWithItems = Quote & {
  items: QuoteItem[];
  attachments: QuoteAttachmentRow[];
};

/**
 * Lines always come back in the order they were entered; attachments
 * carry only display fields of the document (never its storage key).
 */
export const QUOTE_INCLUDE = {
  items: { orderBy: { position: 'asc' as const } },
  attachments: {
    orderBy: { position: 'asc' as const },
    select: {
      position: true,
      document: { select: { id: true, name: true, mimeType: true, size: true } },
    },
  },
} as const;

/** Lines that become milestones on conversion, so carry promised scope. */
const DEFAULT_QUOTE_PREFIX = 'Q-';
/** Where a workspace's first quote starts (keeps the long-standing Q-2001). */
const DEFAULT_QUOTE_START = 2001;
const MAX_NUMBER_ATTEMPTS = 5;

const SCOPED_KINDS: QuoteItemKind[] = [QuoteItemKind.milestone, QuoteItemKind.option];

/** Request lines to rows, numbering positions and dropping fields that don't apply to the kind. */
const toRows = (items: QuoteLineItemDto[]) =>
  items.map((it, position) => {
    const kind = it.kind ?? QuoteItemKind.standard;
    const scoped = SCOPED_KINDS.includes(kind);
    return {
      description: it.description,
      quantity: it.quantity,
      rate: it.rate,
      kind,
      details: it.details?.trim() || null,
      estimatedHours: it.estimatedHours ?? null,
      deliverables: scoped ? quoteDeliverables(it.deliverables) : [],
      acceptanceCriteria: scoped ? it.acceptanceCriteria?.trim() || null : null,
      selected: kind === QuoteItemKind.option ? !!it.selected : false,
      position,
    };
  });

/** Trimmed, blank-free, de-duplicated by id - stored as plain [{id,label}]. */
function quoteDeliverables(
  list: { id: string; label: string }[] | undefined,
): Prisma.InputJsonValue {
  const seen = new Set<string>();
  return (list ?? [])
    .map(({ id, label }) => ({ id, label: label.trim() }))
    .filter((d) => d.label && !seen.has(d.id) && seen.add(d.id));
}

/** A quote line's stored deliverables, tolerating anything odd in the Json column. */
export function readQuoteDeliverables(value: unknown): { id: string; label: string }[] {
  return Array.isArray(value)
    ? value.filter(
        (d): d is { id: string; label: string } =>
          !!d && typeof d.id === 'string' && typeof d.label === 'string',
      )
    : [];
}

const toAttachmentRows = (ids: string[]) =>
  [...new Set(ids)].map((documentId, position) => ({ documentId, position }));

@Injectable()
export class QuotesService {
  private readonly logger = new Logger(QuotesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pagination: PaginationService,
    private readonly clients: ClientsService,
    private readonly events: EventEmitter2,
    private readonly workspaceScope: WorkspaceScope,
    private readonly projects: ProjectsService,
    private readonly billing: MilestoneBillingService,
    private readonly notifications: NotificationService,
  ) {}

  /**
   * Renders the quote PDF from a draft without saving anything - the same
   * document the send mail attaches, so the owner previews exactly what the
   * client will get, unsaved edits included.
   */
  async previewPdf(
    ownerId: string,
    dto: CreateQuoteDto,
  ): Promise<{ filename: string; buffer: Buffer }> {
    const client = await this.clients.findOne(ownerId, dto.clientId);
    const attachmentIds = dto.attachmentIds ?? [];
    if (attachmentIds.length) {
      await this.assertAttachable(dto.clientId, attachmentIds);
    }
    const docs = attachmentIds.length
      ? await this.prisma.document.findMany({
          where: { id: { in: attachmentIds } },
          select: { id: true, name: true },
        })
      : [];
    const names = new Map(docs.map((d) => [d.id, d.name]));
    const number = dto.number?.trim() || 'DRAFT';
    const buffer = await this.notifications.quotePdfBuffer(
      {
        number,
        issueDate: dto.issueDate,
        validUntil: dto.validUntil,
        currency: dto.currency ?? client.currency,
        taxRate: dto.taxRate ?? 0,
        retentionPercent: dto.retentionPercent ?? 0,
        notes: dto.notes ?? null,
        items: toRows(dto.items),
        attachments: [...new Set(attachmentIds)]
          .filter((id) => names.has(id))
          .map((id) => ({ document: { name: names.get(id) as string } })),
      },
      client,
    );
    return { filename: `${number}.pdf`, buffer };
  }

  async create(ownerId: string, dto: CreateQuoteDto): Promise<QuoteWithItems> {
    const client = await this.clients.findOne(ownerId, dto.clientId);
    const { items, number, attachmentIds, ...data } = dto;
    if (attachmentIds?.length) {
      await this.assertAttachable(dto.clientId, attachmentIds);
    }
    const write = (quoteNumber: string) =>
      this.prisma.quote.create({
        data: {
          ...data,
          number: quoteNumber,
          workspaceId: client.workspaceId,
          items: { create: toRows(items) },
          ...(attachmentIds?.length
            ? { attachments: { create: toAttachmentRows(attachmentIds) } }
            : {}),
        },
        include: QUOTE_INCLUDE,
      });
    // A typed number is the user's choice: one attempt, and a clear message
    // if the workspace already uses it. A generated one races other creates
    // in the same workspace, so retry with the next number instead.
    const created = number
      ? await write(number).catch((err) => this.rethrowTakenNumber(err, number))
      : await this.withGeneratedNumber(client.workspaceId, write);
    this.changed({
      quoteId: created.id,
      clientId: created.clientId,
      status: created.status,
    });
    return created;
  }

  findAll(
    ownerId: string,
    query: ListQuotesQueryDto,
    baseUrl: string,
  ): Promise<PaginationRes<QuoteWithItems>> {
    const { cursor, take, clientId, status } = query;
    return this.pagination.paginate<QuoteWithItems>(
      this.prisma.quote,
      {
        where: {
          client: { workspace: this.workspaceScope.owned(ownerId) },
          ...(clientId ? { clientId } : {}),
          ...(status ? { status } : {}),
        },
        include: QUOTE_INCLUDE,
      },
      {
        cursor,
        take,
        orderBy: { createdAt: 'desc' },
        baseUrl,
        includeCount: true,
      },
    );
  }

  async findOne(ownerId: string, id: string): Promise<QuoteWithItems> {
    const quote = await this.prisma.quote.findFirst({
      where: { id, client: { workspace: { ownerId } } },
      include: QUOTE_INCLUDE,
    });
    if (!quote) throw new NotFoundException('Quote not found');
    return quote;
  }

  async update(
    ownerId: string,
    id: string,
    dto: UpdateQuoteDto,
  ): Promise<QuoteWithItems> {
    const existing = await this.findOne(ownerId, id);
    const { items, attachmentIds, ...data } = dto;
    // Attachments are part of what was quoted, so they lock with the lines.
    const scopeChange = !!items || !!data.currency || !!attachmentIds;
    // The project's milestones were generated from these lines; replacing
    // them would orphan that link and let the quote drift from the plan.
    if (existing.projectId && scopeChange) {
      throw new ConflictException(
        'This quote has been converted to a project - its lines, attachments and currency are locked',
      );
    }
    // What the client accepted is what gets built: move the quote out of
    // `accepted` first if it really has to change.
    const clientAccepted =
      existing.status === QuoteStatus.accepted && !!existing.respondedAt;
    const leavingAccepted = !!data.status && data.status !== QuoteStatus.accepted;
    if (clientAccepted && !leavingAccepted && scopeChange) {
      throw new ConflictException(
        'The client accepted this quote - reopen it (change its status) before editing its lines',
      );
    }
    if (attachmentIds?.length) {
      await this.assertAttachable(existing.clientId, attachmentIds);
    }
    // The client's answer belongs to the version they answered: the owner
    // taking the quote back to draft/sent clears it.
    const reopened =
      !!existing.respondedAt &&
      !!data.status &&
      data.status !== existing.status &&
      (data.status === QuoteStatus.draft || data.status === QuoteStatus.sent);
    const updated = await this.prisma.quote.update({
      where: { id },
      data: {
        ...data,
        ...(reopened
          ? { respondedAt: null, respondedBy: null, responseNote: null }
          : {}),
        ...(items ? { items: { deleteMany: {}, create: toRows(items) } } : {}),
        ...(attachmentIds
          ? {
              attachments: {
                deleteMany: {},
                create: toAttachmentRows(attachmentIds),
              },
            }
          : {}),
      },
      include: QUOTE_INCLUDE,
    }).catch((err) => this.rethrowTakenNumber(err, data.number));
    this.changed({
      quoteId: id,
      clientId: updated.clientId,
      status: updated.status,
      ...(updated.status !== existing.status
        ? { previousStatus: existing.status }
        : {}),
    });
    return updated;
  }

  async remove(ownerId: string, id: string): Promise<QuoteWithItems> {
    const quote = await this.findOne(ownerId, id);
    await this.prisma.quote.delete({ where: { id } });
    this.changed({
      quoteId: id,
      clientId: quote.clientId,
      status: quote.status,
      removed: true,
    });
    return quote;
  }

  /** Marks the quote sent and hands it to the notification pipeline. */
  async send(ownerId: string, id: string): Promise<QuoteWithItems> {
    await this.findOne(ownerId, id);
    const quote = await this.prisma.quote.update({
      where: { id },
      // (Re)sending asks the client again - any earlier answer no longer applies.
      data: {
        status: QuoteStatus.sent,
        respondedAt: null,
        respondedBy: null,
        responseNote: null,
      },
      include: { ...QUOTE_INCLUDE, client: true },
    });
    const { client, ...rest } = quote;
    this.events.emit(QuoteEvents.SENT, {
      quote: rest,
      client,
    });
    return rest;
  }

  /**
   * Accepts the quote and turns it into a project in one transaction:
   * budget = the one-off subtotal (pre-tax), retention copied over, and one
   * milestone per milestone line or selected option - priced, estimated and
   * ordered as quoted, the last one releasing retention. Optionally raises
   * the first milestone's invoice upfront (outside the transaction: a
   * failure there leaves the project in place and is reported as null).
   */
  async convert(
    ownerId: string,
    id: string,
    dto: ConvertQuoteDto,
  ): Promise<QuoteConversionEntity> {
    const quote = await this.findOne(ownerId, id);
    if (quote.projectId) {
      throw new ConflictException('This quote was already converted to a project');
    }
    if (
      quote.status === QuoteStatus.declined ||
      quote.status === QuoteStatus.expired
    ) {
      throw new BadRequestException(
        `A ${quote.status} quote can't be converted - reopen it first`,
      );
    }
    const client = await this.clients.findOne(ownerId, quote.clientId);
    // Project budgets and milestone prices are in the client's currency.
    if (client.currency !== quote.currency) {
      throw new BadRequestException(
        `The quote is in ${quote.currency} but ${client.name} is billed in ${client.currency} - change one so they match`,
      );
    }

    const lines = milestoneSchedule(quote.items);
    const upfront = !!dto.invoiceFirstMilestone && lines.length > 0;
    const retention = Number(quote.retentionPercent) || 0;

    const { project, converted } = await this.prisma.$transaction(async (tx) => {
      const project = await this.projects.insert(tx, {
        name: dto.name,
        clientId: client.id,
        status: 'active',
        startDate: dto.startDate,
        endDate: dto.endDate,
        hourlyRate: dto.hourlyRate,
        budget: quoteTotals(quote).subtotal,
        retentionPercent: retention,
        description: `Created from quote ${quote.number}.`,
      });
      for (const [order, line] of lines.entries()) {
        const milestone = await tx.milestone.create({
          data: {
            projectId: project.id,
            name: line.description,
            description: line.details,
            estimatedHours: line.estimatedHours,
            // The scope the client accepted is what they later sign off.
            deliverables: readQuoteDeliverables(line.deliverables).map(
              ({ id, label }) => ({ id, label, done: false }),
            ),
            acceptanceCriteria: line.acceptanceCriteria,
            amount: line.quantity.mul(line.rate),
            order,
            billingTrigger:
              upfront && order === 0
                ? MilestoneBillingTrigger.upfront
                : MilestoneBillingTrigger.on_acceptance,
            releasesRetention: retention > 0 && order === lines.length - 1,
          },
        });
        await tx.quoteItem.update({
          where: { id: line.id },
          data: { milestoneId: milestone.id },
        });
      }
      const converted = await tx.quote.update({
        where: { id },
        data: { status: QuoteStatus.accepted, projectId: project.id },
        include: QUOTE_INCLUDE,
      });
      return { project, converted };
    });
    this.projects.announceCreated(ownerId, client.workspaceId, project.id);
    this.changed({
      quoteId: id,
      clientId: client.id,
      status: QuoteStatus.accepted,
      previousStatus: quote.status,
    });

    let upfrontInvoiceNumber: string | null = null;
    if (upfront) {
      const first = converted.items.find((it) => it.milestoneId);
      try {
        if (first?.milestoneId) {
          upfrontInvoiceNumber = (
            await this.billing.invoice(ownerId, first.milestoneId)
          ).number;
        }
      } catch (err) {
        this.logger.warn(
          `Quote ${quote.number} converted but the upfront invoice failed: ${String(err)}`,
        );
      }
    }

    return {
      quote: converted,
      project,
      milestoneCount: lines.length,
      upfrontInvoiceNumber,
    } as unknown as QuoteConversionEntity;
  }

  /**
   * Attachments are shown to the client in the portal, so they must already
   * belong to that client: a client-level document, or one of its projects'.
   */
  private async assertAttachable(clientId: string, ids: string[]): Promise<void> {
    const unique = [...new Set(ids)];
    const docs = await this.prisma.document.findMany({
      where: {
        id: { in: unique },
        OR: [{ clientId }, { project: { clientId } }],
      },
      select: { size: true },
    });
    if (docs.length !== unique.length) {
      throw new BadRequestException(
        "Attachments must be documents of this quote's client or its projects",
      );
    }
    const total = docs.reduce((sum, d) => sum + d.size, 0);
    if (total > QUOTE_ATTACHMENTS_MAX_BYTES) {
      throw new BadRequestException(
        `Quote attachments total ${(total / MB).toFixed(1)}MB - the limit is ${QUOTE_ATTACHMENTS_MAX_BYTES / MB}MB combined`,
      );
    }
  }

  /** Live-view signal (client portal). quote.sent covers sends. */
  private changed(event: QuoteChangedEvent): void {
    this.events.emit(QuoteEvents.CHANGED, event);
  }

  /**
   * Quote numbers are unique: a typed number that's taken answers with a
   * message the editor can show on the number field, not a 500.
   */
  private rethrowTakenNumber(err: unknown, number?: string): never {
    if (this.isTakenNumber(err)) {
      throw new ConflictException(
        `Quote number ${number ?? ''} is already in use in this workspace - choose another, or clear it to number the quote automatically`,
      );
    }
    throw err;
  }

  /** The per-workspace (workspaceId, number) unique constraint tripped. */
  private isTakenNumber(err: unknown): boolean {
    const { code, meta } = (err ?? {}) as { code?: string; meta?: unknown };
    return code === 'P2002' && JSON.stringify(meta ?? {}).includes('number');
  }

  private async withGeneratedNumber(
    workspaceId: string,
    write: (number: string) => Promise<QuoteWithItems>,
  ): Promise<QuoteWithItems> {
    let lastError: unknown;
    for (let attempt = 0; attempt < MAX_NUMBER_ATTEMPTS; attempt++) {
      try {
        return await write(await this.nextNumber(workspaceId));
      } catch (err) {
        if (!this.isTakenNumber(err)) throw err;
        lastError = err;
      }
    }
    throw new ConflictException(
      'Could not generate a unique quote number, please retry',
      { cause: lastError },
    );
  }

  /**
   * Next number in the workspace's own sequence, using its quotePrefix when
   * set (falling back to "Q-"). Compared numerically, so Q-999 < Q-2001.
   */
  private async nextNumber(workspaceId: string): Promise<string> {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { quotePrefix: true },
    });
    const prefix = workspace?.quotePrefix?.trim() || DEFAULT_QUOTE_PREFIX;
    const existing = await this.prisma.quote.findMany({
      where: { workspaceId, number: { startsWith: prefix } },
      select: { number: true },
    });
    const latest = existing.reduce((max, { number }) => {
      const n = Number(number.slice(prefix.length));
      return Number.isInteger(n) ? Math.max(max, n) : max;
    }, 0);
    return `${prefix}${latest > 0 ? latest + 1 : DEFAULT_QUOTE_START}`;
  }
}
