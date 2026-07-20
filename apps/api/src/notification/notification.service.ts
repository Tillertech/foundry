import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type {
  DocumentSharedEvent,
  InvoicePaidEvent,
  InvoiceReminderDueEvent,
  InvoiceSentEvent,
  QuoteSentEvent,
} from '../common/events';
import {
  PaginationRes,
  PaginationService,
} from '../common/pagination/pagination.service';
import { NotificationKind } from '../generated/prisma/enums';
import type {
  NotificationModel as Notification,
  PaymentModel as Payment,
} from '../generated/prisma/models';
import {
  PdfBrand,
  PdfGeneratorService,
  PdfParty,
} from '../invoices/pdf-generator.service';
import type { ClientModel as Client } from '../generated/prisma/models';
import { logoMimeType } from '../workspaces/workspaces.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import {
  DocumentMailContext,
  InvoiceMailContext,
  MailService,
  QuoteMailContext,
} from './mail/mail.service';
import { NotificationGateway } from './notification.gateway';
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';

interface BillerWorkspace {
  ownerId: string;
  name: string;
  legalName: string | null;
  storageKey: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  postCode: string | null;
  taxCode: string | null;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly mail: MailService,
    private readonly gateway: NotificationGateway,
    private readonly prisma: PrismaService,
    private readonly pagination: PaginationService,
    private readonly pdfService: PdfGeneratorService,
    private readonly storage: StorageService,
  ) {}

  /** Emails the invoice (with PDF attached) and pushes a realtime event to the owner. */
  async onInvoiceSent({ invoice, client }: InvoiceSentEvent): Promise<void> {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: client.workspaceId },
      select: NotificationService.BILLER_SELECT,
    });

    const context = this.invoiceContext(invoice, client.name, workspace?.name);
    const pdf = await this.pdfService.invoicePdf({
      number: invoice.number,
      biller: this.billerParty(workspace),
      billedTo: this.clientParty(client),
      issueDate: context.issueDate,
      dueDate: context.dueDate,
      currency: invoice.currency,
      items: invoice.items.map((item) => ({
        description: item.description,
        quantity: Number(item.quantity),
        rate: Number(item.rate),
      })),
      taxRate: Number(invoice.taxRate),
      discount: Number(invoice.discount),
      notes: invoice.notes ?? undefined,
      brand: await this.pdfBrand(workspace),
    });

    const delivered = await this.mail.sendInvoice(client.email, context, pdf);
    if (workspace) {
      this.gateway.emitToUser(workspace.ownerId, 'invoice.sent', {
        id: invoice.id,
        number: invoice.number,
        clientName: client.name,
      });
      if (delivered) {
        await this.notify(workspace.ownerId, {
          kind: NotificationKind.invoice_sent,
          title: `Invoice ${invoice.number} sent`,
          body: `Invoice ${invoice.number} was emailed to ${client.name} (${client.email}).`,
          resourceId: invoice.id,
        });
      }
    }
    this.logger.log(`Invoice ${invoice.number} sent to ${client.email}`);
  }

  /** Confirms settlement to the client and pushes a realtime event to the owner. */
  async onInvoicePaid({
    invoice,
    client,
    balance,
  }: InvoicePaidEvent): Promise<void> {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: client.workspaceId },
      select: { ownerId: true, name: true },
    });

    const context = this.invoiceContext(
      invoice,
      client.name,
      workspace?.name,
      balance,
    );
    const delivered = await this.mail.sendInvoicePaid(client.email, context);
    if (workspace) {
      this.gateway.emitToUser(workspace.ownerId, 'invoice.paid', {
        id: invoice.id,
        number: invoice.number,
        clientName: client.name,
      });
      if (delivered) {
        const settlement = context.overpaidBy
          ? `overpaid by ${invoice.currency} ${context.overpaidBy}`
          : 'settled in full';
        await this.notify(workspace.ownerId, {
          kind: NotificationKind.invoice_paid,
          title: `Invoice ${invoice.number} paid`,
          body: `Invoice ${invoice.number} is ${settlement} - receipt emailed to ${client.name}.`,
          resourceId: invoice.id,
        });
      }
    }
    this.logger.log(
      `Invoice ${invoice.number} paid - receipt mailed to ${client.email}`,
    );
  }

  /** Emails a due/overdue reminder to the client and notifies the owner. */
  async onInvoiceReminderDue({
    invoice,
    client,
  }: InvoiceReminderDueEvent): Promise<void> {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: client.workspaceId },
      select: { ownerId: true, name: true },
    });

    const context = this.invoiceContext(invoice, client.name, workspace?.name);
    const delivered = await this.mail.sendInvoiceReminder(
      client.email,
      context,
    );
    if (workspace) {
      this.gateway.emitToUser(workspace.ownerId, 'invoice.reminder', {
        id: invoice.id,
        number: invoice.number,
        clientName: client.name,
        dueDate: context.dueDate,
      });
      if (delivered) {
        await this.notify(workspace.ownerId, {
          kind: NotificationKind.invoice_reminder,
          title: `Reminder sent for ${invoice.number}`,
          body: `${client.name} was reminded that invoice ${invoice.number} is due ${context.dueDate}.`,
          resourceId: invoice.id,
        });
      }
    }
    this.logger.log(
      `Reminder for invoice ${invoice.number} sent to ${client.email}`,
    );
  }

  /** Emails the quote (with PDF attached) and pushes a realtime event to the owner. */
  async onQuoteSent({ quote, client }: QuoteSentEvent): Promise<void> {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: client.workspaceId },
      select: NotificationService.BILLER_SELECT,
    });

    const context = this.quoteContext(quote, client.name, workspace?.name);
    const pdf = await this.pdfService.quotePdf({
      number: quote.number,
      biller: this.billerParty(workspace),
      billedTo: this.clientParty(client),
      issueDate: context.issueDate,
      validUntil: context.validUntil,
      currency: quote.currency,
      items: quote.items.map((item) => ({
        description: item.description,
        quantity: Number(item.quantity),
        rate: Number(item.rate),
      })),
      taxRate: Number(quote.taxRate),
      notes: quote.notes ?? undefined,
      brand: await this.pdfBrand(workspace),
    });

    const delivered = await this.mail.sendQuote(client.email, context, pdf);
    if (workspace) {
      this.gateway.emitToUser(workspace.ownerId, 'quote.sent', {
        id: quote.id,
        number: quote.number,
        clientName: client.name,
      });
      if (delivered) {
        await this.notify(workspace.ownerId, {
          kind: NotificationKind.quote_sent,
          title: `Quote ${quote.number} sent`,
          body: `Quote ${quote.number} was emailed to ${client.name} (${client.email}).`,
          resourceId: quote.id,
        });
      }
    }
  }

  /** Emails the stored file to the client and records the share for the owner. */
  async onDocumentShared({
    document,
    client,
  }: DocumentSharedEvent): Promise<void> {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: client.workspaceId },
      select: { ownerId: true, name: true },
    });

    const content = await this.storage.read(document.storageKey);
    const context: DocumentMailContext = {
      clientName: client.name,
      workspaceName: workspace?.name ?? 'Foundry',
      documentName: document.name,
      documentType: document.type.replace(/_/g, ' '),
      notes: document.notes ?? '',
    };
    const delivered = await this.mail.sendDocument(client.email, context, {
      filename: document.name,
      content,
    });
    if (workspace) {
      this.gateway.emitToUser(workspace.ownerId, 'document.shared', {
        id: document.id,
        name: document.name,
        clientName: client.name,
      });
      if (delivered) {
        await this.notify(workspace.ownerId, {
          kind: NotificationKind.document_shared,
          title: `Document shared with ${client.name}`,
          body: `“${document.name}” was emailed to ${client.name} (${client.email}).`,
          resourceId: document.id,
        });
      }
    }
    this.logger.log(`Document ${document.name} shared with ${client.email}`);
  }

  /** Pushes a realtime payment event to the owning user. */
  async onPaymentReceived(payment: Payment): Promise<void> {
    const client = await this.prisma.client.findUnique({
      where: { id: payment.clientId },
      select: { name: true, workspace: { select: { ownerId: true } } },
    });
    if (!client) return;
    this.gateway.emitToUser(client.workspace.ownerId, 'payment.received', {
      id: payment.id,
      amount: Number(payment.amount),
      currency: payment.currency,
      clientName: client.name,
    });
  }

  /** The user's in-app notifications, newest first. */
  list(
    userId: string,
    query: ListNotificationsQueryDto,
    baseUrl: string,
  ): Promise<PaginationRes<Notification>> {
    return this.pagination.paginate<Notification>(
      this.prisma.notification,
      {
        where: {
          userId,
          ...(query.unread ? { readAt: null } : {}),
        },
      },
      {
        cursor: query.cursor,
        take: query.take,
        orderBy: { createdAt: 'desc' },
        baseUrl,
        includeCount: true,
      },
    );
  }

  async unreadCount(userId: string): Promise<{ count: number }> {
    const count = await this.prisma.notification.count({
      where: { userId, readAt: null },
    });
    return { count };
  }

  async markRead(userId: string, id: string): Promise<Notification> {
    const notification = await this.prisma.notification.findFirst({
      where: { id, userId },
    });
    if (!notification) throw new NotFoundException('Notification not found');
    if (notification.readAt) return notification;
    return this.prisma.notification.update({
      where: { id },
      data: { readAt: new Date() },
    });
  }

  async markAllRead(userId: string): Promise<{ count: number }> {
    const { count } = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { count };
  }

  /** Persists an in-app notification and pushes it over the socket. */
  private async notify(
    userId: string,
    data: {
      kind: NotificationKind;
      title: string;
      body: string;
      resourceId?: string;
    },
  ): Promise<void> {
    const notification = await this.prisma.notification.create({
      data: { userId, ...data },
    });
    this.gateway.emitToUser(userId, 'notification.created', notification);
  }

  /** Workspace fields needed to render the issuer (FROM) block on PDFs. */
  private static readonly BILLER_SELECT = {
    ownerId: true,
    name: true,
    legalName: true,
    storageKey: true,
    email: true,
    phone: true,
    website: true,
    address: true,
    city: true,
    country: true,
    postCode: true,
    taxCode: true,
  } as const;


  private billerParty(workspace: BillerWorkspace | null): PdfParty {
    if (!workspace) return { name: 'Foundry' };
    return {
      name: workspace.name,
      detail: workspace.legalName,
      address: workspace.address,
      city: workspace.city,
      postCode: workspace.postCode,
      country: workspace.country,
      email: workspace.email,
      phone: workspace.phone,
      website: workspace.website,
      taxLabel: 'Tax ID',
      taxId: workspace.taxCode,
    };
  }

// billed to
  private clientParty(client: Client): PdfParty {
    return {
      name: client.name,
      detail: client.company,
      address: client.address,
      email: client.email,
      phone: client.phone,
      taxLabel: 'Tax ID',
      taxId: client.taxId,
    };
  }

  private async pdfBrand(
    workspace: BillerWorkspace | null,
  ): Promise<PdfBrand | undefined> {
    if (!workspace) return undefined;
    const brand: PdfBrand = {
      name: workspace.name,
      subName: workspace.legalName ?? undefined,
    };
    if (workspace.storageKey) {
      try {
        const logo = await this.storage.read(workspace.storageKey);
        brand.logoDataUrl = `data:${logoMimeType(workspace.storageKey)};base64,${logo.toString('base64')}`;
      } catch (error) {
        this.logger.warn(
          `Could not read workspace logo ${workspace.storageKey}: ${String(error)}`,
        );
      }
    }
    return brand;
  }

  private invoiceContext(
    invoice: InvoiceSentEvent['invoice'],
    clientName: string,
    workspaceName = 'Foundry',
    /** Balance still owed; negative when overpaid (settlement mails). */
    balance = 0,
  ): InvoiceMailContext {
    const subtotal = invoice.items.reduce(
      (sum, item) => sum + Number(item.quantity) * Number(item.rate),
      0,
    );
    const discount = Number(invoice.discount) || 0;
    const afterDiscount = Math.max(0, subtotal - discount);
    const taxRate = Number(invoice.taxRate) || 0;
    const tax = afterDiscount * (taxRate / 100);
    const total = afterDiscount + tax;
    const money = (n: number) => n.toFixed(2);
    const day = (d: Date) => new Date(d).toISOString().slice(0, 10);

    return {
      clientName,
      workspaceName,
      number: invoice.number,
      issueDate: day(invoice.issueDate),
      dueDate: day(invoice.dueDate),
      currency: invoice.currency,
      items: invoice.items.map((item) => ({
        description: item.description,
        quantity: String(Number(item.quantity)),
        rate: money(Number(item.rate)),
        amount: money(Number(item.quantity) * Number(item.rate)),
      })),
      subtotal: money(subtotal),
      discount: money(discount),
      taxRate: String(taxRate),
      tax: money(tax),
      total: money(total),
      notes: invoice.notes ?? '',
      amountPaid: money(total - balance),
      overpaidBy: balance < 0 ? money(-balance) : '',
    };
  }

  private quoteContext(
    quote: QuoteSentEvent['quote'],
    clientName: string,
    workspaceName = 'Foundry',
  ): QuoteMailContext {
    const subtotal = quote.items.reduce(
      (sum, item) => sum + Number(item.quantity) * Number(item.rate),
      0,
    );
    const taxRate = Number(quote.taxRate) || 0;
    const tax = subtotal * (taxRate / 100);
    const money = (n: number) => n.toFixed(2);
    const day = (d: Date) => new Date(d).toISOString().slice(0, 10);

    return {
      clientName,
      workspaceName,
      number: quote.number,
      issueDate: day(quote.issueDate),
      validUntil: day(quote.validUntil),
      currency: quote.currency,
      items: quote.items.map((item) => ({
        description: item.description,
        quantity: String(Number(item.quantity)),
        rate: money(Number(item.rate)),
        amount: money(Number(item.quantity) * Number(item.rate)),
      })),
      subtotal: money(subtotal),
      taxRate: String(taxRate),
      tax: money(tax),
      total: money(subtotal + tax),
      notes: quote.notes ?? '',
    };
  }
}
