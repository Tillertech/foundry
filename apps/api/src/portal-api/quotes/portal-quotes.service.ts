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
import { QuoteEvents, type QuoteRespondedEvent } from '../../common/events';
import { QuoteItemKind, QuoteStatus } from '../../generated/prisma/enums';
import type {
  DocumentModel as Document,
  QuoteModel as Quote,
  QuoteItemModel as QuoteItem,
} from '../../generated/prisma/models';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { NotificationService } from '../../notification/notification.service';
import { QuoteAttachmentRow } from '../../quotes/quotes.service';
import { PortalContextService } from '../portal-context.service';
import {
  BillingScope,
  PortalBillingService,
  PortalProjectRef,
} from '../billing/portal-billing.service';
import { PortalQuotesQueryDto } from './dto/portal-quotes-query.dto';
import {
  AcceptPortalQuoteDto,
  DeclinePortalQuoteDto,
} from './dto/respond-portal-quote.dto';

export type PortalQuoteWithItems = Omit<Quote, 'workspaceId'> & {
  items: QuoteItem[];
  attachments: QuoteAttachmentRow[];
};

/** A quote as the portal shows it: its project named only when shared with the user. */
export type PortalQuoteView = PortalQuoteWithItems & {
  project: PortalProjectRef | null;
};

/**
 * Lines in entry order, minus internal detail: hours estimates are
 * capacity planning (kept out of the portal's milestones too) and the
 * milestone link is workspace-side bookkeeping.
 */
/** Internal columns a portal quote never carries. */
const PORTAL_QUOTE_OMIT = { workspaceId: true } as const;

const PORTAL_QUOTE_INCLUDE = {
  items: {
    orderBy: { position: 'asc' as const },
    omit: { estimatedHours: true, milestoneId: true },
  },
  // Display fields only - the storage key never leaves the API.
  attachments: {
    orderBy: { position: 'asc' as const },
    select: {
      position: true,
      document: {
        select: { id: true, name: true, mimeType: true, size: true },
      },
    },
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
    private readonly storage: StorageService,
    private readonly notifications: NotificationService,
    private readonly billing: PortalBillingService,
  ) {}

  /** Never hands out the id of a project this user can't open. */
  private withProject(
    quote: PortalQuoteWithItems,
    projects: Map<string, PortalProjectRef>,
  ): PortalQuoteView {
    const project = quote.projectId
      ? (projects.get(quote.projectId) ?? null)
      : null;
    return { ...quote, projectId: project ? quote.projectId : null, project };
  }

  /** The quote PDF - the same document the quote mail attached. */
  async downloadPdf(
    clientPortalId: string,
    portalUserId: string,
    id: string,
  ): Promise<{ filename: string; buffer: Buffer }> {
    const { clientId } = await this.context.require(
      clientPortalId,
      'viewQuotes',
    );
    const scope = await this.billing.billingScope(clientPortalId, portalUserId);
    const quote = await this.prisma.quote.findFirst({
      where: { id, clientId, ...VISIBLE, ...scope },
      include: { ...PORTAL_QUOTE_INCLUDE, client: true },
    });
    if (!quote) throw new NotFoundException('Quote not found');
    const buffer = await this.notifications.quotePdfBuffer(quote, quote.client);
    return { filename: `${quote.number}.pdf`, buffer };
  }

  async findAll(
    clientPortalId: string,
    portalUserId: string,
    query: PortalQuotesQueryDto,
    baseUrl: string,
  ): Promise<PaginationRes<PortalQuoteView>> {
    const { clientId } = await this.context.require(
      clientPortalId,
      'viewQuotes',
    );
    if (query.projectId) {
      await this.billing.assertVisible(
        clientPortalId,
        portalUserId,
        query.projectId,
      );
    }
    const [projects, scope] = await Promise.all([
      this.billing.visibleProjects(clientPortalId, portalUserId),
      this.billing.billingScope(clientPortalId, portalUserId),
    ]);
    const page = await this.pagination.paginate<PortalQuoteWithItems>(
      this.prisma.quote,
      {
        where: {
          clientId,
          ...VISIBLE,
          ...scope,
          ...(query.status ? { status: query.status } : {}),
          ...(query.projectId ? { projectId: query.projectId } : {}),
        },
        include: PORTAL_QUOTE_INCLUDE,
        omit: PORTAL_QUOTE_OMIT,
      },
      {
        cursor: query.cursor,
        take: query.take,
        orderBy: { createdAt: 'desc' },
        baseUrl,
        includeCount: true,
      },
    );
    return {
      ...page,
      results: page.results.map((q) => this.withProject(q, projects)),
    };
  }

  async findOne(
    clientPortalId: string,
    portalUserId: string,
    id: string,
  ): Promise<PortalQuoteView> {
    const { clientId } = await this.context.require(
      clientPortalId,
      'viewQuotes',
    );
    const [scope, projects] = await Promise.all([
      this.billing.billingScope(clientPortalId, portalUserId),
      this.billing.visibleProjects(clientPortalId, portalUserId),
    ]);
    const quote = await this.visibleQuote(clientId, id, scope);
    return this.withProject(quote, projects);
  }

  /**
   * A file attached to a quote the client can see. Gated by viewQuotes, not
   * viewDocuments: attaching it to the quote is what shares it. Returns the
   * full row for the controller's headers only - never serialized.
   */
  async downloadAttachment(
    clientPortalId: string,
    portalUserId: string,
    quoteId: string,
    documentId: string,
  ): Promise<{ document: Document; content: Buffer }> {
    const { clientId } = await this.context.require(
      clientPortalId,
      'viewQuotes',
    );
    const scope = await this.billing.billingScope(clientPortalId, portalUserId);
    const attachment = await this.prisma.quoteAttachment.findFirst({
      where: { quoteId, documentId, quote: { clientId, ...VISIBLE, ...scope } },
      include: { document: true },
    });
    if (!attachment) throw new NotFoundException('Attachment not found');
    const content = await this.storage.read(attachment.document.storageKey);
    return { document: attachment.document, content };
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
    const { clientId } = await this.context.require(
      clientPortalId,
      'viewQuotes',
    );
    const scope = await this.billing.billingScope(clientPortalId, portalUserId);
    const quote = await this.answerable(clientId, id, scope);

    const optionIds = new Set(
      quote.items
        .filter((it) => it.kind === QuoteItemKind.option)
        .map((it) => it.id),
    );
    const picked = new Set(dto.optionIds ?? []);
    for (const pickedId of picked) {
      if (!optionIds.has(pickedId)) {
        throw new BadRequestException(
          'One of the picked options is not on this quote',
        );
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
        omit: PORTAL_QUOTE_OMIT,
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
    const { clientId } = await this.context.require(
      clientPortalId,
      'viewQuotes',
    );
    const scope = await this.billing.billingScope(clientPortalId, portalUserId);
    await this.answerable(clientId, id, scope);
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
      omit: PORTAL_QUOTE_OMIT,
    });
    await this.announce(updated.id, false, respondedBy, note);
    return updated;
  }

  private async visibleQuote(
    clientId: string,
    id: string,
    scope: BillingScope,
  ): Promise<PortalQuoteWithItems> {
    const quote = await this.prisma.quote.findFirst({
      where: { id, clientId, ...VISIBLE, ...scope },
      include: PORTAL_QUOTE_INCLUDE,
      omit: PORTAL_QUOTE_OMIT,
    });
    if (!quote) throw new NotFoundException('Quote not found');
    return quote;
  }

  /** Only a sent, unexpired quote that hasn't become a project can be answered. */
  private async answerable(
    clientId: string,
    id: string,
    scope: BillingScope,
  ): Promise<PortalQuoteWithItems> {
    const quote = await this.visibleQuote(clientId, id, scope);
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
