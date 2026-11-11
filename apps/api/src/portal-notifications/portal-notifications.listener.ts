import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  DocumentEvents,
  InvoiceEvents,
  MilestoneEvents,
  QuoteEvents,
  type DocumentSharedEvent,
  type InvoiceSentEvent,
  type MilestoneChangedEvent,
  type QuoteChangedEvent,
  type QuoteSentEvent,
} from '../common/events';
import {
  MilestoneStatus,
  PortalNotificationKind,
  QuoteStatus,
} from '../generated/prisma/enums';
import { quoteTotals } from '../quotes/quote-totals';
import { PrismaService } from '../prisma/prisma.service';
import { PortalSocketEvents } from './portal-notifications.gateway';
import {
  PortalNotificationInput,
  PortalNotificationsService,
} from './portal-notifications.service';

const day = (d: Date) => new Date(d).toISOString().slice(0, 10);
const money = (currency: string, n: number) =>
  `${currency} ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Fans workspace-side activity out to client-portal users: stored
 * notifications for news worth keeping (a quote or invoice arriving, a
 * milestone starting, delivered for review, or signed off) and live-only
 * signals so open portal pages refresh their milestones and quotes.
 * Every handler swallows its own errors - portal delivery must never break
 * the workspace action that triggered it.
 */
@Injectable()
export class PortalNotificationsListener {
  private readonly logger = new Logger(PortalNotificationsListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly portal: PortalNotificationsService,
  ) {}

  @OnEvent(QuoteEvents.SENT, { async: true })
  async onQuoteSent({ quote, client }: QuoteSentEvent): Promise<void> {
    await this.safely('quote.sent', async () => {
      const users = await this.portal.recipients(
        client.id,
        'viewQuotes',
        quote.projectId,
        { billing: true },
      );
      const from = await this.workspaceName(client.workspaceId);
      await this.portal.notify(users, {
        kind: PortalNotificationKind.quote_sent,
        title: `New quote ${quote.number}`,
        body: `${from} sent you a quote for ${money(quote.currency, quoteTotals(quote).total)}, valid until ${day(quote.validUntil)}.`,
        resourceId: quote.id,
      });
      this.portal.push(users, PortalSocketEvents.QUOTE_CHANGED, {
        quoteId: quote.id,
        removed: false,
      });
    });
  }

  @OnEvent(QuoteEvents.CHANGED, { async: true })
  async onQuoteChanged(event: QuoteChangedEvent): Promise<void> {
    // A draft the client never saw (and still can't) is none of their business.
    const wasVisible =
      event.previousStatus !== undefined &&
      event.previousStatus !== QuoteStatus.draft;
    if (event.status === QuoteStatus.draft && !wasVisible) return;
    await this.safely('quote.changed', async () => {
      // A removed quote is gone - the signal only tells open pages to drop it.
      const quote = event.removed
        ? null
        : await this.prisma.quote.findUnique({
            where: { id: event.quoteId },
            select: { projectId: true },
          });
      const users = await this.portal.recipients(
        event.clientId,
        'viewQuotes',
        quote?.projectId,
        { billing: true },
      );
      this.portal.push(users, PortalSocketEvents.QUOTE_CHANGED, {
        quoteId: event.quoteId,
        removed: !!event.removed,
      });
    });
  }

  @OnEvent(InvoiceEvents.SENT, { async: true })
  async onInvoiceSent({ invoice, client }: InvoiceSentEvent): Promise<void> {
    await this.safely('invoice.sent', async () => {
      // Invoices are gated by viewPayments - there is no separate flag.
      const users = await this.portal.recipients(
        client.id,
        'viewPayments',
        invoice.projectId,
        { billing: true },
      );
      await this.portal.notify(users, {
        kind: PortalNotificationKind.invoice_sent,
        title: `Invoice ${invoice.number}`,
        body: `A new invoice is ready, due ${day(invoice.dueDate)}.`,
        resourceId: invoice.id,
      });
    });
  }

  @OnEvent(DocumentEvents.SHARED, { async: true })
  async onDocumentShared({
    document,
    client,
  }: DocumentSharedEvent): Promise<void> {
    await this.safely('document.shared', async () => {
      // A project's document (with or without the client set) is visible
      // only through that project's share - same rule as GET /portal/documents.
      const users = await this.portal.recipients(
        client.id,
        'viewDocuments',
        document.projectId ?? undefined,
      );
      await this.portal.notify(users, {
        kind: PortalNotificationKind.document_shared,
        title: `New document: ${document.name}`,
        body: 'A document was shared with you.',
        resourceId: document.id,
      });
    });
  }

  @OnEvent(MilestoneEvents.CHANGED, { async: true })
  async onMilestoneChanged(event: MilestoneChangedEvent): Promise<void> {
    await this.safely('milestone.changed', async () => {
      const project = await this.prisma.project.findUnique({
        where: { id: event.projectId },
        select: { id: true, name: true, clientId: true },
      });
      if (!project) return;
      const users = await this.portal.recipients(
        project.clientId,
        'viewProjects',
        project.id,
      );
      if (!users.length) return;

      this.portal.push(users, PortalSocketEvents.MILESTONE_CHANGED, {
        projectId: project.id,
        milestoneId: event.milestoneId,
        removed: !!event.removed,
      });

      const news = this.milestoneNews(event, project.name);
      if (news)
        await this.portal.notify(users, { ...news, resourceId: project.id });
    });
  }

  /** Status moves worth a stored notification; null for anything else. */
  private milestoneNews(
    event: MilestoneChangedEvent,
    projectName: string,
  ): Omit<PortalNotificationInput, 'resourceId'> | null {
    if (!event.status || event.removed || !event.name) return null;
    switch (event.status) {
      case MilestoneStatus.in_progress:
        // Back from review means the client asked for changes themselves.
        if (event.previousStatus === MilestoneStatus.delivered) return null;
        return {
          kind: PortalNotificationKind.milestone_started,
          title: `Work started: ${event.name}`,
          body: `${projectName} - this milestone is now in progress.`,
        };
      case MilestoneStatus.delivered:
        return {
          kind: PortalNotificationKind.milestone_delivered,
          title: `Ready for your review: ${event.name}`,
          body: `${projectName} - the deliverables have been handed over. Check them against the acceptance criteria.`,
        };
      case MilestoneStatus.accepted:
      case MilestoneStatus.completed:
        return {
          kind: PortalNotificationKind.milestone_accepted,
          title: `${event.status === MilestoneStatus.accepted ? 'Signed off' : 'Completed'}: ${event.name}`,
          body: `${projectName} - this milestone is done.`,
        };
      default:
        return null;
    }
  }

  private async workspaceName(workspaceId: string): Promise<string> {
    const ws = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { name: true },
    });
    return ws?.name ?? 'Your supplier';
  }

  private async safely(label: string, run: () => Promise<void>): Promise<void> {
    try {
      await run();
    } catch (err) {
      this.logger.error(`portal ${label} delivery failed`, err as Error);
    }
  }
}
