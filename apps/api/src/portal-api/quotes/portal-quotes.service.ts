import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  PaginationRes,
  PaginationService,
} from '../../common/pagination/pagination.service';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { QuoteEvents, type QuoteRespondedEvent } from '../../common/events';
import { QuoteItemKind, QuoteStatus } from '../../generated/prisma/enums';
import type {
  QuoteModel as Quote,
  QuoteItemModel as QuoteItem,
} from '../../generated/prisma/models';
import { PrismaService } from '../../prisma/prisma.service';
import { PortalContextService } from '../portal-context.service';
import { AcceptPortalQuoteDto, DeclinePortalQuoteDto } from './dto/respond-portal-quote.dto';

export type PortalQuoteWithItems = Quote & { items: QuoteItem[] };

/**
 * Lines in entry order, minus internal detail: hours estimates are
 * capacity planning (kept out of the portal's milestones too) and the
 * milestone link is workspace-side bookkeeping.
 */
const PORTAL_QUOTE_INCLUDE = {
  items: {
    orderBy: { position: 'asc' as const },
    omit: { estimatedHours: true, milestoneId: true },
  },
};

/** Drafts are the workspace's work in progress - the client only sees a quote once it's been sent. */
const VISIBLE = { status: { not: QuoteStatus.draft } };

@Injectable()
export class PortalQuotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pagination: PaginationService,
    private readonly context: PortalContextService,
    private readonly events: EventEmitter2,
  ) {}

  async findAll(
    clientPortalId: string,
    query: PaginationQueryDto,
    baseUrl: string,
  ): Promise<PaginationRes<PortalQuoteWithItems>> {
    const { clientId } = await this.context.require(
      clientPortalId,
      'viewQuotes',
    );
    return this.pagination.paginate<PortalQuoteWithItems>(
      this.prisma.quote,
      { where: { clientId, ...VISIBLE }, include: PORTAL_QUOTE_INCLUDE },
      {
        cursor: query.cursor,
        take: query.take,
        orderBy: { createdAt: 'desc' },
        baseUrl,
        includeCount: true,
      },
    );
  }

  async findOne(
    clientPortalId: string,
    id: string,
  ): Promise<PortalQuoteWithItems> {
    const { clientId } = await this.context.require(
      clientPortalId,
      'viewQuotes',
    );
    return this.visibleQuote(clientId, id);
  }

  /**
   * The client accepts a sent quote, optionally picking which options to
   * include (the rest are left out). Records who answered and tells the
   * workspace; starting the project stays the owner's call.
   */
  async accept(
    clientPortalId: string,
    portalUserId: string,
    id: string,
    dto: AcceptPortalQuoteDto,
  ): Promise<PortalQuoteWithItems> {
    const { clientId } = await this.context.require(clientPortalId, 'viewQuotes');
    const quote = await this.answerable(clientId, id);

    const optionIds = new Set(
      quote.items.filter((it) => it.kind === QuoteItemKind.option).map((it) => it.id),
    );
    const picked = new Set(dto.optionIds ?? []);
    for (const pickedId of picked) {
      if (!optionIds.has(pickedId)) {
        throw new BadRequestException('One of the picked options is not on this quote');
      }
    }

    const respondedBy = await this.who(portalUserId);
    const updated = await this.prisma.$transaction(async (tx) => {
      // Only when the client actually chose: omitting optionIds keeps the
      // options exactly as quoted.
      if (dto.optionIds) {
        for (const optionId of optionIds) {
          await tx.quoteItem.update({
            where: { id: optionId },
            data: { selected: picked.has(optionId) },
          });
        }
      }
      return tx.quote.update({
        where: { id },
        data: {
          status: QuoteStatus.accepted,
          respondedAt: new Date(),
          respondedBy,
          responseNote: null,
        },
        include: PORTAL_QUOTE_INCLUDE,
      });
    });
    await this.announce(updated.id, true, respondedBy, null);
    return updated;
  }

  async decline(
    clientPortalId: string,
    portalUserId: string,
    id: string,
    dto: DeclinePortalQuoteDto,
  ): Promise<PortalQuoteWithItems> {
    const { clientId } = await this.context.require(clientPortalId, 'viewQuotes');
    await this.answerable(clientId, id);
    const respondedBy = await this.who(portalUserId);
    const note = dto.reason?.trim() || null;
    const updated = await this.prisma.quote.update({
      where: { id },
      data: {
        status: QuoteStatus.declined,
        respondedAt: new Date(),
        respondedBy,
        responseNote: note,
      },
      include: PORTAL_QUOTE_INCLUDE,
    });
    await this.announce(updated.id, false, respondedBy, note);
    return updated;
  }

  private async visibleQuote(
    clientId: string,
    id: string,
  ): Promise<PortalQuoteWithItems> {
    const quote = await this.prisma.quote.findFirst({
      where: { id, clientId, ...VISIBLE },
      include: PORTAL_QUOTE_INCLUDE,
    });
    if (!quote) throw new NotFoundException('Quote not found');
    return quote;
  }

  /** Only a sent, unexpired quote that hasn't become a project can be answered. */
  private async answerable(
    clientId: string,
    id: string,
  ): Promise<PortalQuoteWithItems> {
    const quote = await this.visibleQuote(clientId, id);
    if (quote.status !== QuoteStatus.sent || quote.projectId) {
      throw new ConflictException(
        quote.status === QuoteStatus.accepted
          ? 'This quote was already accepted'
          : quote.status === QuoteStatus.declined
            ? 'This quote was already declined'
            : 'This quote can no longer be answered',
      );
    }
    // validUntil is a day: the quote stays answerable through that whole day.
    const endOfValidity = new Date(quote.validUntil);
    endOfValidity.setUTCHours(23, 59, 59, 999);
    if (endOfValidity.getTime() < Date.now()) {
      throw new BadRequestException(
        'This quote has expired - ask for an updated one',
      );
    }
    return quote;
  }

  private async who(portalUserId: string): Promise<string> {
    const user = await this.prisma.clientPortalUser.findUnique({
      where: { id: portalUserId },
      select: { name: true, email: true },
    });
    return user ? `${user.name} <${user.email}>` : 'Client';
  }

  private async announce(
    quoteId: string,
    accepted: boolean,
    respondedBy: string,
    note: string | null,
  ): Promise<void> {
    const full = await this.prisma.quote.findUnique({
      where: { id: quoteId },
      include: { items: { orderBy: { position: 'asc' } }, client: true },
    });
    if (!full) return;
    const { client, ...quote } = full;
    this.events.emit(QuoteEvents.RESPONDED, {
      quote,
      client,
      accepted,
      respondedBy,
      note,
    } satisfies QuoteRespondedEvent);
    this.events.emit(QuoteEvents.CHANGED, {
      quoteId,
      clientId: client.id,
      status: quote.status,
      previousStatus: QuoteStatus.sent,
    });
  }
}
