import { Injectable, Logger } from '@nestjs/common';
import type { InvoiceSentEvent } from '../common/events';
import type { PaymentModel as Payment } from '../generated/prisma/models';
import { PdfGeneratorService } from '../invoices/pdf-generator.service';
import { PrismaService } from '../prisma/prisma.service';
import { InvoiceMailContext, MailService } from './mail/mail.service';
import { NotificationGateway } from './notification.gateway';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly mail: MailService,
    private readonly gateway: NotificationGateway,
    private readonly prisma: PrismaService,
    private readonly pdfService: PdfGeneratorService,
  ) {}

  /** Emails the invoice (with PDF attached) and pushes a realtime event to the owner. */
  async onInvoiceSent({ invoice, client }: InvoiceSentEvent): Promise<void> {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: client.workspaceId },
      select: { ownerId: true, name: true },
    });

    const context = this.invoiceContext(invoice, client.name, workspace?.name);
    const pdf = await this.pdfService.invoicePdf({
      number: invoice.number,
      client: client.name,
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
    });

    await this.mail.sendInvoice(client.email, context, pdf);
    if (workspace) {
      this.gateway.emitToUser(workspace.ownerId, 'invoice.sent', {
        id: invoice.id,
        number: invoice.number,
        clientName: client.name,
      });
    }
    this.logger.log(`Invoice ${invoice.number} sent to ${client.email}`);
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

  private invoiceContext(
    invoice: InvoiceSentEvent['invoice'],
    clientName: string,
    workspaceName = 'Foundry',
  ): InvoiceMailContext {
    const subtotal = invoice.items.reduce(
      (sum, item) => sum + Number(item.quantity) * Number(item.rate),
      0,
    );
    const discount = Number(invoice.discount) || 0;
    const afterDiscount = Math.max(0, subtotal - discount);
    const taxRate = Number(invoice.taxRate) || 0;
    const tax = afterDiscount * (taxRate / 100);
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
      total: money(afterDiscount + tax),
      notes: invoice.notes ?? '',
    };
  }
}
