import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InvoiceEvents } from '../common/events';
import {
  PaginationRes,
  PaginationService,
} from '../common/pagination/pagination.service';
import { InvoiceStatus, ReconciliationKind } from '../generated/prisma/enums';
import type {
  ClientModel as Client,
  InvoiceItemModel as InvoiceItem,
  InvoiceModel as Invoice,
  PaymentModel as Payment,
  ReconciliationEntryModel as ReconciliationEntry,
} from '../generated/prisma/models';
import { PrismaService } from '../prisma/prisma.service';
import { ListTimelineQueryDto } from './dto/list-timeline-query.dto';

type InvoiceForReconciliation = Invoice & {
  items: InvoiceItem[];
  client: Client;
};

/** Both balances an entry snapshots; project is null when the invoice has none. */
interface Balances {
  invoiceBalance: number;
  projectBalance: number | null;
}

/**
 * Applies payments against invoice and project balances and keeps an
 * immutable timeline (ReconciliationEntry) of every application, adjustment
 * and reversal. Entries carry both the invoice and the project link so the
 * same timeline is viewable from either aggregate, or both.
 */
@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pagination: PaginationService,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * Records a new payment against its invoice: writes a timeline entry with
   * the balances after the payment and marks the invoice paid once the
   * balance reaches zero (or immediately when forcePaid is set).
   */
  async applyPayment(
    payment: Payment,
    opts: { forcePaid?: boolean } = {},
  ): Promise<ReconciliationEntry | null> {
    if (!payment.invoiceId) return null;
    const invoice = await this.loadInvoice(payment.invoiceId);
    if (!invoice) return null;

    const balances = await this.balances(invoice);
    const entry = await this.entry(invoice, {
      kind: ReconciliationKind.payment_applied,
      amount: Number(payment.amount),
      currency: payment.currency,
      balances,
      paymentId: payment.id,
      note: this.note('applied to', invoice, balances.invoiceBalance),
    });
    await this.transition(invoice, balances.invoiceBalance, opts.forcePaid);
    return entry;
  }

  /**
   * Records the removal of a payment (call after the payment row is gone):
   * writes a reversal entry and reopens the invoice if it no longer balances.
   */
  async reversePayment(payment: Payment): Promise<ReconciliationEntry | null> {
    if (!payment.invoiceId) return null;
    const invoice = await this.loadInvoice(payment.invoiceId);
    if (!invoice) return null;

    const balances = await this.balances(invoice);
    const entry = await this.entry(invoice, {
      kind: ReconciliationKind.payment_reversed,
      amount: -Number(payment.amount),
      currency: payment.currency,
      balances,
      note: this.note('reversed on', invoice, balances.invoiceBalance),
    });
    await this.transition(invoice, balances.invoiceBalance);
    return entry;
  }

  /**
   * Reconciles an edited payment. A move between invoices is a reversal on
   * the old invoice plus an application on the new one; an amount change on
   * the same invoice is a single delta entry. A currency change rewrites the
   * payment's existing entries so the timeline always renders in the
   * currency actually paid.
   */
  async adjustPayment(before: Payment, after: Payment): Promise<void> {
    if (before.invoiceId !== after.invoiceId) {
      await this.reversePayment(before);
      await this.applyPayment(after);
      return;
    }
    if (!after.invoiceId) return;
    if (before.currency !== after.currency) {
      await this.prisma.reconciliationEntry.updateMany({
        where: { paymentId: after.id },
        data: { currency: after.currency },
      });
    }
    const delta = Number(after.amount) - Number(before.amount);
    if (delta === 0) return;

    const invoice = await this.loadInvoice(after.invoiceId);
    if (!invoice) return;
    const balances = await this.balances(invoice);
    await this.entry(invoice, {
      kind:
        delta > 0
          ? ReconciliationKind.payment_applied
          : ReconciliationKind.payment_reversed,
      amount: delta,
      currency: after.currency,
      balances,
      paymentId: after.id,
      note: this.note('adjusted on', invoice, balances.invoiceBalance),
    });
    await this.transition(invoice, balances.invoiceBalance);
  }

  /**
   * Timeline entries scoped to an invoice, a project, or both (union),
   * newest first. Ownership is enforced through the workspace chain.
   */
  timeline(
    ownerId: string,
    filter: { invoiceId?: string; projectId?: string },
    query: ListTimelineQueryDto,
    baseUrl: string,
  ): Promise<PaginationRes<ReconciliationEntry>> {
    const scopes: Record<string, unknown>[] = [];
    if (filter.invoiceId) {
      scopes.push({
        invoiceId: filter.invoiceId,
        invoice: { client: { workspace: { ownerId } } },
      });
    }
    if (filter.projectId) {
      scopes.push({
        projectId: filter.projectId,
        project: { client: { workspace: { ownerId } } },
      });
    }
    const where = scopes.length === 1 ? scopes[0] : { OR: scopes };
    return this.pagination.paginate<ReconciliationEntry>(
      this.prisma.reconciliationEntry,
      { where },
      {
        cursor: query.cursor,
        take: query.take,
        orderBy: { createdAt: 'desc' },
        baseUrl,
        includeCount: true,
      },
    );
  }

  private loadInvoice(
    id: string,
  ): Promise<InvoiceForReconciliation | null> {
    return this.prisma.invoice.findUnique({
      where: { id },
      include: { items: true, client: true },
    });
  }

  private entry(
    invoice: InvoiceForReconciliation,
    data: {
      kind: ReconciliationKind;
      amount: number;
      currency: Payment['currency'];
      balances: Balances;
      paymentId?: string;
      note: string;
    },
  ): Promise<ReconciliationEntry> {
    return this.prisma.reconciliationEntry.create({
      data: {
        kind: data.kind,
        amount: data.amount,
        currency: data.currency,
        invoiceBalance: data.balances.invoiceBalance,
        projectBalance: data.balances.projectBalance,
        paymentId: data.paymentId,
        invoiceId: invoice.id,
        projectId: invoice.projectId,
        note: data.note,
      },
    });
  }

  /**
   * Moves the invoice to the status its balance dictates after an entry:
   * settled → paid, negative balance → overpaid, part of the total covered →
   * partially_paid, and fully reversed settlements reopen to sent/overdue.
   */
  private async transition(
    invoice: InvoiceForReconciliation,
    invoiceBalance: number,
    forcePaid = false,
  ): Promise<void> {
    if (invoice.status === InvoiceStatus.cancelled) return;

    const next = this.statusFor(invoice, invoiceBalance, forcePaid);
    if (!next || next === invoice.status) return;

    await this.prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: next },
    });
    this.logger.log(
      `Invoice ${invoice.number} → ${next} (${this.balanceMessage(invoice, invoiceBalance)})`,
    );

    const settled =
      next === InvoiceStatus.paid || next === InvoiceStatus.overpaid;
    const wasSettled =
      invoice.status === InvoiceStatus.paid ||
      invoice.status === InvoiceStatus.overpaid;
    if (settled && !wasSettled) {
      const { client, ...rest } = invoice;
      this.events.emit(InvoiceEvents.PAID, {
        invoice: { ...rest, status: next },
        client,
        balance: invoiceBalance,
      });
    }
  }

  /** Status the balance dictates; null when the current status should stand. */
  private statusFor(
    invoice: InvoiceForReconciliation,
    balance: number,
    forcePaid: boolean,
  ): InvoiceStatus | null {
    if (balance < 0) return InvoiceStatus.overpaid;
    if (balance === 0 || forcePaid) return InvoiceStatus.paid;
    const total = this.round(this.invoiceTotal(invoice));
    if (balance < total) return InvoiceStatus.partially_paid;
    // Nothing paid any more: reopen previously settled/partial invoices.
    const reopenable: InvoiceStatus[] = [
      InvoiceStatus.paid,
      InvoiceStatus.overpaid,
      InvoiceStatus.partially_paid,
    ];
    if (reopenable.includes(invoice.status)) {
      return invoice.dueDate < new Date()
        ? InvoiceStatus.overdue
        : InvoiceStatus.sent;
    }
    return null;
  }

  /** Timeline note: what happened plus where the invoice balance stands. */
  private note(
    action: 'applied to' | 'reversed on' | 'adjusted on',
    invoice: InvoiceForReconciliation,
    balance: number,
  ): string {
    return `Payment ${action} ${invoice.number} — ${this.balanceMessage(invoice, balance)}`;
  }

  private balanceMessage(
    invoice: InvoiceForReconciliation,
    balance: number,
  ): string {
    if (balance < 0)
      return `overpaid by ${invoice.currency} ${(-balance).toFixed(2)}`;
    if (balance === 0) return 'settled in full';
    return `${invoice.currency} ${balance.toFixed(2)} outstanding`;
  }

  /** Balance still owed on the invoice and, when linked, budget left on the project. */
  private async balances(
    invoice: InvoiceForReconciliation,
  ): Promise<Balances> {
    const paid = await this.prisma.payment.aggregate({
      where: { invoiceId: invoice.id },
      _sum: { amount: true },
    });
    const invoiceBalance = this.round(
      this.invoiceTotal(invoice) - Number(paid._sum.amount ?? 0),
    );

    let projectBalance: number | null = null;
    if (invoice.projectId) {
      const project = await this.prisma.project.findUnique({
        where: { id: invoice.projectId },
        select: { budget: true },
      });
      if (project) {
        const projectPaid = await this.prisma.payment.aggregate({
          where: { invoice: { projectId: invoice.projectId } },
          _sum: { amount: true },
        });
        projectBalance = this.round(
          Number(project.budget) - Number(projectPaid._sum.amount ?? 0),
        );
      }
    }
    return { invoiceBalance, projectBalance };
  }

  private invoiceTotal(invoice: Invoice & { items: InvoiceItem[] }): number {
    const subtotal = invoice.items.reduce(
      (sum, item) => sum + Number(item.quantity) * Number(item.rate),
      0,
    );
    const afterDiscount = Math.max(0, subtotal - Number(invoice.discount));
    const tax = afterDiscount * (Number(invoice.taxRate) / 100);
    return afterDiscount + tax;
  }

  private round(value: number): number {
    return Math.round(value * 100) / 100;
  }
}
