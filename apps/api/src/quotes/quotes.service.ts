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
import { MilestoneBillingService } from '../milestones/milestone-billing.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';
import { ConvertQuoteDto } from './dto/convert-quote.dto';
import { CreateQuoteDto } from './dto/create-quote.dto';
import { QuoteLineItemDto } from './dto/quote-line-item.dto';
import { QuoteConversionEntity } from './entities/quote-conversion.entity';
import { milestoneSchedule, quoteTotals } from './quote-totals';
import { ListQuotesQueryDto } from './dto/list-quotes-query.dto';
import { UpdateQuoteDto } from './dto/update-quote.dto';
import { WorkspaceScope } from '../common/workspace-scope/workspace-scope';

export type QuoteWithItems = Quote & { items: QuoteItem[] };

/** Lines always come back in the order they were entered. */
const QUOTE_INCLUDE = {
  items: { orderBy: { position: 'asc' as const } },
} as const;

/** Request lines to rows, numbering positions and dropping fields that don't apply to the kind. */
const toRows = (items: QuoteLineItemDto[]) =>
  items.map((it, position) => ({
    description: it.description,
    quantity: it.quantity,
    rate: it.rate,
    kind: it.kind ?? QuoteItemKind.standard,
    details: it.details?.trim() || null,
    estimatedHours: it.estimatedHours ?? null,
    selected: it.kind === QuoteItemKind.option ? !!it.selected : false,
    position,
  }));

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
  ) {}

  async create(ownerId: string, dto: CreateQuoteDto): Promise<QuoteWithItems> {
    await this.clients.findOne(ownerId, dto.clientId);
    const { items, number, ...data } = dto;
    const created = await this.prisma.quote.create({
      data: {
        ...data,
        number: number ?? (await this.nextNumber()),
        items: { create: toRows(items) },
      },
      include: QUOTE_INCLUDE,
    });
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
    const { items, ...data } = dto;
    // The project's milestones were generated from these lines; replacing
    // them would orphan that link and let the quote drift from the plan.
    if (existing.projectId && (items || data.currency)) {
      throw new ConflictException(
        'This quote has been converted to a project - its lines and currency are locked',
      );
    }
    // What the client accepted is what gets built: move the quote out of
    // `accepted` first if it really has to change.
    const clientAccepted =
      existing.status === QuoteStatus.accepted && !!existing.respondedAt;
    const leavingAccepted = !!data.status && data.status !== QuoteStatus.accepted;
    if (clientAccepted && !leavingAccepted && (items || data.currency)) {
      throw new ConflictException(
        'The client accepted this quote - reopen it (change its status) before editing its lines',
      );
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
      },
      include: QUOTE_INCLUDE,
    });
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

  /** Live-view signal (client portal). quote.sent covers sends. */
  private changed(event: QuoteChangedEvent): void {
    this.events.emit(QuoteEvents.CHANGED, event);
  }

  private async nextNumber(): Promise<string> {
    const latest = await this.prisma.quote.findFirst({
      where: { number: { startsWith: 'Q-' } },
      orderBy: { number: 'desc' },
      select: { number: true },
    });
    const current = Number(latest?.number.replace('Q-', ''));
    return `Q-${Number.isNaN(current) ? 2001 : current + 1}`;
  }
}
