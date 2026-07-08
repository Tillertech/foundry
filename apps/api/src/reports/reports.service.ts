import { Inject, Injectable } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { CacheTimer } from '../common/cache-timer';
import { Currency, InvoiceStatus } from '../generated/prisma/enums';
import type {
  InvoiceItemModel as InvoiceItem,
  InvoiceModel as Invoice,
} from '../generated/prisma/models';
import { InvoicesService } from '../invoices/invoices.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReportSummaryQueryDto } from './dto/report-summary-query.dto';
import {
  ReportCurrencyEntity,
  ReportSummaryEntity,
} from './entities/report-summary.entity';

/** Invoice statuses that still owe money. */
const OPEN_STATUSES: InvoiceStatus[] = [
  InvoiceStatus.sent,
  InvoiceStatus.viewed,
  InvoiceStatus.partially_paid,
  InvoiceStatus.overdue,
];

const SETTLED_STATUSES: InvoiceStatus[] = [
  InvoiceStatus.paid,
  InvoiceStatus.overpaid,
];

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly invoices: InvoicesService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  /**
   * Business summary for the period, cached for five minutes. Every converted
   * figure is expressed in the workspace currency (workspace takes
   * precedence); paymentsByCurrency additionally keeps the currency the
   * customer actually paid with.
   */
  async summary(
    ownerId: string,
    query: ReportSummaryQueryDto,
  ): Promise<ReportSummaryEntity> {
    const cacheKey = `reports_${ownerId}_${query.from ?? 'all'}_${query.to ?? 'all'}`;
    const cached = await this.cache.get<ReportSummaryEntity>(cacheKey);
    if (cached) return cached;

    const summary = await this.build(ownerId, query);
    await this.cache.set(cacheKey, summary, CacheTimer.custom(5));
    return summary;
  }

  private async build(
    ownerId: string,
    query: ReportSummaryQueryDto,
  ): Promise<ReportSummaryEntity> {
    const from = query.from ? new Date(query.from) : undefined;
    // Inclusive end of day so a date-only `to` covers the whole day.
    const to = query.to
      ? new Date(new Date(query.to).getTime() + 24 * 60 * 60 * 1000 - 1)
      : undefined;
    const range = (field: string) =>
      from || to
        ? { [field]: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
        : {};

    const workspace = await this.prisma.workspace.findFirst({
      where: { ownerId },
      orderBy: { createdAt: 'asc' },
      select: { currency: true },
    });
    const currency = workspace?.currency ?? Currency.USD;
    const convert = (base: Currency, amount: number) =>
      this.invoices.convert(base, currency, amount);

    const [invoices, payments, expenses] = await Promise.all([
      this.prisma.invoice.findMany({
        where: { client: { workspace: { ownerId } }, ...range('issueDate') },
        include: {
          items: true,
          payments: { select: { amount: true } },
          client: { select: { id: true, name: true, company: true } },
        },
      }),
      this.prisma.payment.findMany({
        where: { client: { workspace: { ownerId } }, ...range('date') },
        select: {
          amount: true,
          currency: true,
          date: true,
          clientId: true,
        },
      }),
      this.prisma.expense.findMany({
        where: {
          OR: [
            { projectId: null },
            { project: { client: { workspace: { ownerId } } } },
          ],
          ...range('date'),
        },
        select: { amount: true, currency: true, category: true, date: true },
      }),
    ]);

    let invoiced = 0;
    let outstanding = 0;
    let overdue = 0;
    const byStatus = new Map<InvoiceStatus, number>();
    const byClient = new Map<
      string,
      { name: string; invoiced: number; collected: number }
    >();
    for (const invoice of invoices) {
      const total = await convert(invoice.currency, this.total(invoice));
      invoiced += total;
      byStatus.set(invoice.status, (byStatus.get(invoice.status) ?? 0) + 1);

      const clientRow = byClient.get(invoice.client.id) ?? {
        name: invoice.client.company || invoice.client.name,
        invoiced: 0,
        collected: 0,
      };
      clientRow.invoiced += total;
      byClient.set(invoice.client.id, clientRow);

      if (OPEN_STATUSES.includes(invoice.status)) {
        const paid = invoice.payments.reduce(
          (sum, p) => sum + Number(p.amount),
          0,
        );
        const balance = await convert(
          invoice.currency,
          Math.max(0, this.total(invoice) - paid),
        );
        outstanding += balance;
        if (invoice.status === InvoiceStatus.overdue) overdue += balance;
      }
    }

    let collected = 0;
    const monthly = new Map<string, { collected: number; expenses: number }>();
    const byCurrency = new Map<Currency, { count: number; amount: number }>();
    for (const payment of payments) {
      const amount = Number(payment.amount);
      const converted = await convert(payment.currency, amount);
      collected += converted;

      const month = this.month(payment.date);
      const monthRow = monthly.get(month) ?? { collected: 0, expenses: 0 };
      monthRow.collected += converted;
      monthly.set(month, monthRow);

      const currencyRow = byCurrency.get(payment.currency) ?? {
        count: 0,
        amount: 0,
      };
      currencyRow.count += 1;
      currencyRow.amount += amount;
      byCurrency.set(payment.currency, currencyRow);

      const clientRow = byClient.get(payment.clientId);
      if (clientRow) clientRow.collected += converted;
    }

    let expensesTotal = 0;
    const byCategory = new Map<string, number>();
    for (const expense of expenses) {
      const converted = await convert(expense.currency, Number(expense.amount));
      expensesTotal += converted;
      byCategory.set(
        expense.category,
        (byCategory.get(expense.category) ?? 0) + converted,
      );
      const month = this.month(expense.date);
      const monthRow = monthly.get(month) ?? { collected: 0, expenses: 0 };
      monthRow.expenses += converted;
      monthly.set(month, monthRow);
    }

    const paymentsByCurrency: ReportCurrencyEntity[] = [];
    for (const [paidCurrency, row] of byCurrency) {
      paymentsByCurrency.push({
        currency: paidCurrency,
        count: row.count,
        amount: this.round(row.amount),
        converted: this.round(await convert(paidCurrency, row.amount)),
      });
    }
    paymentsByCurrency.sort((a, b) => b.converted - a.converted);

    const paidInvoiceCount = invoices.filter((i) =>
      SETTLED_STATUSES.includes(i.status),
    ).length;

    return {
      currency,
      from: query.from ?? null,
      to: query.to ?? null,
      invoiced: this.round(invoiced),
      collected: this.round(collected),
      outstanding: this.round(outstanding),
      overdue: this.round(overdue),
      expenses: this.round(expensesTotal),
      netProfit: this.round(collected - expensesTotal),
      invoiceCount: invoices.length,
      paidInvoiceCount,
      avgInvoiceValue: this.round(
        invoices.length ? invoiced / invoices.length : 0,
      ),
      paymentCount: payments.length,
      invoicesByStatus: [...byStatus.entries()]
        .map(([status, count]) => ({ status, count }))
        .sort((a, b) => b.count - a.count),
      monthly: [...monthly.entries()]
        .map(([month, row]) => ({
          month,
          collected: this.round(row.collected),
          expenses: this.round(row.expenses),
        }))
        .sort((a, b) => a.month.localeCompare(b.month)),
      topClients: [...byClient.entries()]
        .map(([clientId, row]) => ({
          clientId,
          name: row.name,
          invoiced: this.round(row.invoiced),
          collected: this.round(row.collected),
        }))
        .sort((a, b) => b.invoiced - a.invoiced)
        .slice(0, 6),
      expensesByCategory: [...byCategory.entries()]
        .map(([category, amount]) => ({ category, amount: this.round(amount) }))
        .sort((a, b) => b.amount - a.amount),
      paymentsByCurrency,
    };
  }

  private total(invoice: Invoice & { items: InvoiceItem[] }): number {
    const subtotal = invoice.items.reduce(
      (sum, item) => sum + Number(item.quantity) * Number(item.rate),
      0,
    );
    const afterDiscount = Math.max(0, subtotal - Number(invoice.discount));
    return afterDiscount + afterDiscount * (Number(invoice.taxRate) / 100);
  }

  private month(date: Date): string {
    return date.toISOString().slice(0, 7);
  }

  private round(value: number): number {
    return Math.round(value * 100) / 100;
  }
}
