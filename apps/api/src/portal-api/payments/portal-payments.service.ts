import { PortalPaymentsQueryDto } from './portal-payments-query.dto';
import { Injectable } from '@nestjs/common';
import {
  PaginationRes,
  PaginationService,
} from '../../common/pagination/pagination.service';
import type { PaymentModel as Payment } from '../../generated/prisma/models';
import { PrismaService } from '../../prisma/prisma.service';
import {
  PortalBillingService,
  PortalProjectRef,
} from '../billing/portal-billing.service';
import { PortalContextService } from '../portal-context.service';

type PaymentRow = Payment & {
  invoice: {
    id: string;
    number: string;
    projectId: string | null;
    status: string;
  } | null;
};

export type PortalPayment = Payment & {
  invoice: { id: string; number: string } | null;
  project: PortalProjectRef | null;
};

@Injectable()
export class PortalPaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pagination: PaginationService,
    private readonly context: PortalContextService,
    private readonly billing: PortalBillingService,
  ) {}

  /**
   * Payments with what they paid for: the invoice (number) and, through it,
   * the project - named only when that project is shared with this user.
   */
  async findAll(
    clientPortalId: string,
    portalUserId: string,
    query: PortalPaymentsQueryDto,
    baseUrl: string,
  ): Promise<PaginationRes<PortalPayment>> {
    const { clientId } = await this.context.require(
      clientPortalId,
      'viewPayments',
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
      this.billing.paymentScope(clientPortalId, portalUserId),
    ]);
    const page = await this.pagination.paginate<PaymentRow>(
      this.prisma.payment,
      {
        where: {
          clientId,
          ...scope,
          ...(query.projectId
            ? { invoice: { projectId: query.projectId } }
            : {}),
          ...(query.method ? { method: query.method } : {}),
        },
        include: {
          // Drafts never reach the client, so neither does their number.
          invoice: {
            select: { id: true, number: true, projectId: true, status: true },
          },
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
    return {
      ...page,
      results: page.results.map(({ invoice, ...p }) => {
        const shown = invoice && invoice.status !== 'draft' ? invoice : null;
        const project = shown?.projectId
          ? (projects.get(shown.projectId) ?? null)
          : null;
        return {
          ...p,
          invoiceId: shown ? p.invoiceId : null,
          invoice: shown ? { id: shown.id, number: shown.number } : null,
          project,
        };
      }),
    };
  }
}
