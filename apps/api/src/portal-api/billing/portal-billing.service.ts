import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { InvoiceStatus } from '../../generated/prisma/enums';
import { PrismaService } from '../../prisma/prisma.service';
import { PortalContextService } from '../portal-context.service';

/** A `where` fragment on projectId shared by invoices and quotes. */
export type BillingScope = {
  OR?: ({ projectId: null } | { projectId: { in: string[] } })[];
};

export interface PortalProjectRef {
  id: string;
  name: string;
}

interface Totalable {
  items: { quantity: unknown; rate: unknown }[];
  taxRate: unknown;
  discount: unknown;
}

/** Statuses the client owes money on (sent and not withdrawn). */
const BILLED: InvoiceStatus[] = [
  InvoiceStatus.sent,
  InvoiceStatus.viewed,
  InvoiceStatus.partially_paid,
  InvoiceStatus.paid,
  InvoiceStatus.overpaid,
  InvoiceStatus.overdue,
];

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Shared money-and-links logic for the portal's invoice, payment and project
 * views: which project a record belongs to (named only when this portal user
 * can see that project - never leak an unshared project's name or id), what
 * an invoice totals, what has been paid on it, and a project's overall
 * financial position.
 */
@Injectable()
export class PortalBillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: PortalContextService,
  ) {}

  /** The projects this user can see, by id. */
  async visibleProjects(
    clientPortalId: string,
    portalUserId: string,
  ): Promise<Map<string, PortalProjectRef>> {
    const ids = await this.context.sharedProjectIds(
      clientPortalId,
      portalUserId,
    );
    if (!ids.length) return new Map();
    const rows = await this.prisma.project.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
    });
    return new Map(rows.map((p) => [p.id, p]));
  }

  /**
   * Which billing records (invoices, quotes - and payments through their
   * invoice) this user may see, as a `where` fragment on `projectId`. A user
   * on "all shared projects" sees every client record (an unshared project's
   * stays anonymous via visibleProjects). A user on "specific projects" sees
   * only project-less records and those of their own visible projects.
   */
  async billingScope(
    clientPortalId: string,
    portalUserId: string,
  ): Promise<BillingScope> {
    const access = await this.context.projectAccess(
      clientPortalId,
      portalUserId,
    );
    if (access.allProjects) return {};
    return {
      OR: [{ projectId: null }, { projectId: { in: access.projectIds } }],
    };
  }

  /** billingScope() for payments, which reach a project through their invoice. */
  async paymentScope(
    clientPortalId: string,
    portalUserId: string,
  ): Promise<Prisma.PaymentWhereInput> {
    const scope = await this.billingScope(clientPortalId, portalUserId);
    if (!scope.OR) return {};
    return { OR: [{ invoiceId: null }, { invoice: scope }] };
  }

  /** 404s a project filter the user can't see (same as opening it). */
  async assertVisible(
    clientPortalId: string,
    portalUserId: string,
    projectId: string,
  ): Promise<void> {
    const ids = await this.context.sharedProjectIds(
      clientPortalId,
      portalUserId,
    );
    if (!ids.includes(projectId))
      throw new NotFoundException('Project not found');
  }

  /** Same formula as invoiceTotal() in shared-util: discount before tax. */
  total(inv: Totalable): number {
    return this.amounts(inv).total;
  }

  /** Pre-tax (net of discount) and with-tax amounts of an invoice. */
  amounts(inv: Totalable): { net: number; total: number } {
    const subtotal = inv.items.reduce(
      (s, it) => s + Number(it.quantity) * Number(it.rate),
      0,
    );
    const net = Math.max(0, subtotal - (Number(inv.discount) || 0));
    return {
      net: round2(net),
      total: round2(net * (1 + (Number(inv.taxRate) || 0) / 100)),
    };
  }

  /** Payments recorded against each invoice. */
  async paidByInvoice(invoiceIds: string[]): Promise<Map<string, number>> {
    if (!invoiceIds.length) return new Map();
    const rows = await this.prisma.payment.groupBy({
      by: ['invoiceId'],
      where: { invoiceId: { in: invoiceIds } },
      _sum: { amount: true },
    });
    return new Map(
      rows.flatMap((r) =>
        r.invoiceId ? [[r.invoiceId, round2(Number(r._sum.amount ?? 0))]] : [],
      ),
    );
  }


  async projectFinancials(
    clientPortalId: string,
    portalUserId: string,
    projectId: string,
  ) {
    await this.context.require(clientPortalId, 'viewProjects');
    const { clientId } = await this.context.require(
      clientPortalId,
      'viewPayments',
    );
    await this.assertVisible(clientPortalId, portalUserId, projectId);

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: {
        budget: true,
        client: { select: { currency: true } },
        milestones: {
          select: {
            retainedAmount: true,
            releasesRetention: true,
            invoice: { select: { status: true } },
          },
        },
      },
    });
    if (!project) throw new NotFoundException('Project not found');
    const currency = project.client.currency;

    const invoices = await this.prisma.invoice.findMany({
      // Only this client's invoices: a project moved over from another
      // client keeps the invoices billed to that client, which this portal
      // must never see.
      where: { projectId, clientId, status: { in: BILLED } },
      select: {
        id: true,
        number: true,
        status: true,
        dueDate: true,
        currency: true,
        taxRate: true,
        discount: true,
        items: { select: { quantity: true, rate: true } },
      },
      orderBy: { dueDate: 'asc' },
    });
    const paid = await this.paidByInvoice(invoices.map((i) => i.id));

    const now = Date.now();
    let invoiced = 0;
    /** Pre-tax, to compare with the (pre-tax) budget. */
    let invoicedNet = 0;
    let received = 0;
    let overdue = 0;
    let otherCurrencyInvoices = 0;
    let nextDue: {
      id: string;
      number: string;
      dueDate: Date;
      balance: number;
    } | null = null;
    for (const inv of invoices) {
      if (inv.currency !== currency) {
        otherCurrencyInvoices++;
        continue;
      }
      const { net, total } = this.amounts(inv);
      const got = paid.get(inv.id) ?? 0;
      const balance = Math.max(0, round2(total - got));
      invoiced += total;
      invoicedNet += net;
      received += got;
      if (balance > 0) {
        if (inv.dueDate.getTime() < now) overdue += balance;
        else if (!nextDue) {
          nextDue = {
            id: inv.id,
            number: inv.number,
            dueDate: inv.dueDate,
            balance,
          };
        }
      }
    }

    // Held on billed milestone invoices, until the final milestone's invoice releases it.
    const billed = project.milestones.filter(
      (m) =>
        m.invoice &&
        m.invoice.status !== InvoiceStatus.draft &&
        m.invoice.status !== InvoiceStatus.cancelled,
    );
    const released = billed.some((m) => m.releasesRetention);
    const retentionHeld = released
      ? 0
      : round2(billed.reduce((s, m) => s + Number(m.retainedAmount), 0));

    const budget = Number(project.budget);
    const outstanding = Math.max(0, round2(invoiced - received));
    return {
      currency,
      budget,
      invoiced: round2(invoiced),
      paid: round2(received),
      outstanding,
      overdue: round2(overdue),
      // Budgets are pre-tax (a converted quote's subtotal), so compare net.
      remainingToInvoice: Math.max(0, round2(budget - invoicedNet)),
      retentionHeld,
      invoiceCount: invoices.length - otherCurrencyInvoices,
      otherCurrencyInvoices,
      nextDue,
    };
  }
}
