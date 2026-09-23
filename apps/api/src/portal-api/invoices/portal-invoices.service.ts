import { Injectable, NotFoundException } from '@nestjs/common';
import {
  PaginationRes,
  PaginationService,
} from '../../common/pagination/pagination.service';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import type { ExpenseCategory } from '../../generated/prisma/enums';
import type {
  InvoiceModel as Invoice,
  InvoiceItemModel as InvoiceItem,
} from '../../generated/prisma/models';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationService } from '../../notification/notification.service';
import { PortalContextService } from '../portal-context.service';

export type PortalInvoiceWithItems = Omit<Invoice, 'workspaceId'> & {
  items: (InvoiceItem & {
    expense: { vendor: string; category: ExpenseCategory; date: Date } | null;
  })[];
};

/**
 * Lines plus the vendor/category/date of any re-billed expense - enough for
 * the client to recognise the cost, without the owner's internal expense
 * notes or project bookkeeping.
 */
const ITEMS_INCLUDE = {
  items: {
    include: {
      expense: { select: { vendor: true, category: true, date: true } },
    },
  },
} as const;

/** workspaceId is an internal identifier of the biller's own account - never return it to a portal user. */
const SAFE_OMIT = { workspaceId: true } as const;

@Injectable()
export class PortalInvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pagination: PaginationService,
    private readonly context: PortalContextService,
    private readonly notifications: NotificationService,
  ) {}

  async findAll(
    clientPortalId: string,
    query: PaginationQueryDto,
    baseUrl: string,
  ): Promise<PaginationRes<PortalInvoiceWithItems>> {
    const { clientId } = await this.context.require(
      clientPortalId,
      'viewPayments',
    );
    return this.pagination.paginate<PortalInvoiceWithItems>(
      this.prisma.invoice,
      {
        where: { clientId, status: { not: 'draft' } },
        include: ITEMS_INCLUDE,
        omit: SAFE_OMIT,
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

  async findOne(
    clientPortalId: string,
    id: string,
  ): Promise<PortalInvoiceWithItems> {
    const { clientId } = await this.context.require(
      clientPortalId,
      'viewPayments',
    );
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, clientId, status: { not: 'draft' } },
      include: ITEMS_INCLUDE,
      omit: SAFE_OMIT,
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    return invoice;
  }

  async downloadPdf(
    clientPortalId: string,
    id: string,
  ): Promise<{ filename: string; buffer: Buffer }> {
    const { clientId } = await this.context.require(
      clientPortalId,
      'viewPayments',
    );
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, clientId, status: { not: 'draft' } },
      include: {
        items: { include: { expense: { select: { date: true } } } },
        client: true,
      },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    const { client, ...rest } = invoice;
    const buffer = await this.notifications.invoicePdfBuffer(rest, client);
    return { filename: `${invoice.number}.pdf`, buffer };
  }
}
