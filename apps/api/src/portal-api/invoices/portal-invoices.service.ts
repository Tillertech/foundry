import { PortalInvoicesQueryDto } from './portal-invoices-query.dto';
import { Injectable, NotFoundException } from '@nestjs/common';
import {
  PaginationRes,
  PaginationService,
} from '../../common/pagination/pagination.service';
import type { ExpenseCategory } from '../../generated/prisma/enums';
import type {
  InvoiceModel as Invoice,
  InvoiceItemModel as InvoiceItem,
} from '../../generated/prisma/models';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationService } from '../../notification/notification.service';
import { PortalContextService } from '../portal-context.service';
import {
  PortalBillingService,
  PortalProjectRef,
} from '../billing/portal-billing.service';

type InvoiceRow = Omit<Invoice, 'workspaceId'> & {
  items: (InvoiceItem & {
    expense: { vendor: string; category: ExpenseCategory; date: Date } | null;
  })[];
};

/** An invoice as the client sees it: which project it's for, and where it stands. */
export type PortalInvoiceWithItems = InvoiceRow & {
  /** The project it bills - only when that project is shared with this user. */
  project: PortalProjectRef | null;
  total: number;
  amountPaid: number;
  balanceDue: number;
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
    private readonly billing: PortalBillingService,
  ) {}

  /** Adds project (masked to what the user can see), total, paid and balance. */
  private async decorate(
    rows: InvoiceRow[],
    projects: Map<string, PortalProjectRef>,
  ): Promise<PortalInvoiceWithItems[]> {
    const paid = await this.billing.paidByInvoice(rows.map((r) => r.id));
    return rows.map((r) => {
      const total = this.billing.total(r);
      const amountPaid = paid.get(r.id) ?? 0;
      const project = r.projectId ? (projects.get(r.projectId) ?? null) : null;
      return {
        ...r,
        // Don't hand out the id of a project this user can't open.
        projectId: project ? r.projectId : null,
        project,
        total,
        amountPaid,
        balanceDue: Math.max(0, Math.round((total - amountPaid) * 100) / 100),
      };
    });
  }

  async findAll(
    clientPortalId: string,
    portalUserId: string,
    query: PortalInvoicesQueryDto,
    baseUrl: string,
  ): Promise<PaginationRes<PortalInvoiceWithItems>> {
    const { clientId } = await this.context.require(
      clientPortalId,
      'viewPayments',
    );
    if (query.projectId) {
      await this.billing.assertVisible(clientPortalId, portalUserId, query.projectId);
    }
    const projects = await this.billing.visibleProjects(clientPortalId, portalUserId);
    const page = await this.pagination.paginate<InvoiceRow>(
      this.prisma.invoice,
      {
        where: {
          clientId,
          // A status filter can never ask for drafts (the DTO refuses it).
          status: query.status ?? { not: 'draft' },
          ...(query.projectId ? { projectId: query.projectId } : {}),
        },
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
    return { ...page, results: await this.decorate(page.results, projects) };
  }

  async findOne(
    clientPortalId: string,
    portalUserId: string,
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
    const projects = await this.billing.visibleProjects(clientPortalId, portalUserId);
    const [decorated] = await this.decorate([invoice], projects);
    return decorated;
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
