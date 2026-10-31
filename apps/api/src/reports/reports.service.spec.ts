import type { Mock } from 'vitest';
import { HttpException, HttpStatus } from '@nestjs/common';
import { throwError } from 'rxjs';
import { CacheTimer } from '../common/cache-timer';
import { Prisma } from '../generated/prisma/client';
import { InvoicesService } from '../invoices/invoices.service';
import { ReportsService } from './reports.service';
import { WorkspaceScope } from '../common/workspace-scope/workspace-scope';

const ownerId = 'owner-1';

/** Multipliers the fake rate cache serves, keyed `BASE_TARGET`. */
const RATES: Record<string, number> = {
  EUR_KES: 150,
  USD_KES: 129,
  GBP_KES: 170,
  JPY_KES: 0.82,
  KES_USD: 0.0077,
  EUR_USD: 1.08,
  GBP_USD: 1.27,
};

const dec = (n: number | string) => new Prisma.Decimal(n);

const payment = (
  amount: number | string,
  currency: string,
  date = '2026-07-10',
  clientId = 'client-1',
) => ({ amount: dec(amount), currency, date: new Date(date), clientId });

const expense = (
  amount: number | string,
  currency: string,
  date = '2026-07-12',
  category = 'software',
) => ({ amount: dec(amount), currency, date: new Date(date), category });

const invoice = (over: Record<string, unknown> = {}) => ({
  id: 'invoice-1',
  status: 'sent',
  currency: 'KES',
  taxRate: dec(0),
  discount: dec(0),
  items: [{ quantity: dec(1), rate: dec(1000) }],
  payments: [],
  client: { id: 'client-1', name: 'Elena', company: 'Northwind' },
  ...over,
});

describe('ReportsService', () => {
  let service: ReportsService;
  let prisma: {
    workspace: { findFirst: Mock };
    invoice: { findMany: Mock };
    payment: { findMany: Mock };
    expense: { findMany: Mock };
  };
  /** Report-summary cache (ReportsService). */
  let cache: { get: Mock; set: Mock };
  /** Exchange-rate cache (InvoicesService) - kept apart so each is asserted on its own. */
  let rateCache: { get: Mock; set: Mock };
  let http: { get: Mock };

  const workspaceCurrency = (currency: string | null) =>
    prisma.workspace.findFirst.mockResolvedValue(
      currency ? { currency } : null,
    );

  beforeEach(() => {
    prisma = {
      workspace: {
        findFirst: vi.fn().mockResolvedValue({ currency: 'KES' }),
      },
      invoice: { findMany: vi.fn().mockResolvedValue([]) },
      payment: { findMany: vi.fn().mockResolvedValue([]) },
      expense: { findMany: vi.fn().mockResolvedValue([]) },
    };
    cache = { get: vi.fn().mockResolvedValue(undefined), set: vi.fn() };
    rateCache = {
      get: vi.fn(async (key: string) => {
        const pair = key.replace(/^fx_/, '');
        return pair in RATES
          ? { base: pair.slice(0, 3), target: pair.slice(4), mid: RATES[pair] }
          : undefined;
      }),
      set: vi.fn(),
    };
    // Any pair missing from RATES falls through to the network, which is down.
    http = {
      get: vi.fn(() => throwError(() => new Error('ECONNRESET'))),
    };

    // The real rate lookup rather than a stand-in for it.
    const invoices = new InvoicesService(
      prisma as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      rateCache as any,
      http as any,
      new WorkspaceScope(),
    );
    service = new ReportsService(
      prisma as any,
      invoices,
      cache as any,
      new WorkspaceScope(),
    );
  });

  describe('net profit', () => {
    it('is collected minus expenses when everything is in the workspace currency', async () => {
      prisma.payment.findMany.mockResolvedValue([
        payment(5000, 'KES'),
        payment(2500, 'KES'),
      ]);
      prisma.expense.findMany.mockResolvedValue([expense(1200, 'KES')]);

      const summary = await service.summary(ownerId, {});

      expect(summary).toEqual(
        expect.objectContaining({
          currency: 'KES',
          collected: 7500,
          expenses: 1200,
          netProfit: 6300,
        }),
      );
      // Same-currency amounts never need a rate.
      expect(rateCache.get).not.toHaveBeenCalled();
      expect(http.get).not.toHaveBeenCalled();
    });

    it('converts payments and expenses from each of their currencies before subtracting', async () => {
      prisma.payment.findMany.mockResolvedValue([
        payment(100, 'EUR'), // 15,000 KES
        payment(2000, 'KES'), //  2,000 KES
        payment(50, 'USD'), //  6,450 KES
      ]);
      prisma.expense.findMany.mockResolvedValue([
        expense(20, 'GBP'), // 3,400 KES
        expense(10, 'USD'), // 1,290 KES
        expense(1000, 'JPY'), //   820 KES
      ]);

      const summary = await service.summary(ownerId, {});

      expect(summary.currency).toBe('KES');
      expect(summary.collected).toBe(23450);
      expect(summary.expenses).toBe(5510);
      expect(summary.netProfit).toBe(17940);
    });

    it('is not the face-value difference of mixed-currency amounts', async () => {
      prisma.payment.findMany.mockResolvedValue([payment(100, 'EUR')]);
      prisma.expense.findMany.mockResolvedValue([expense(5000, 'KES')]);

      const summary = await service.summary(ownerId, {});

      // 100 EUR - 5000 KES read at face value would be a 4,900 loss.
      expect(summary.netProfit).toBe(10000);
    });

    it('goes negative when converted expenses exceed converted income', async () => {
      prisma.payment.findMany.mockResolvedValue([payment(1000, 'KES')]);
      prisma.expense.findMany.mockResolvedValue([expense(100, 'EUR')]);

      const summary = await service.summary(ownerId, {});

      expect(summary.collected).toBe(1000);
      expect(summary.expenses).toBe(15000);
      expect(summary.netProfit).toBe(-14000);
    });

    it('re-expresses the same records when the workspace currency differs', async () => {
      const payments = [payment(100, 'EUR'), payment(10000, 'KES')];
      const expenses = [expense(20, 'GBP')];
      prisma.payment.findMany.mockResolvedValue(payments);
      prisma.expense.findMany.mockResolvedValue(expenses);

      workspaceCurrency('KES');
      const inKes = await service.summary(ownerId, {});
      workspaceCurrency('USD');
      const inUsd = await service.summary(ownerId, {});

      expect(inKes.currency).toBe('KES');
      expect(inKes.netProfit).toBe(15000 + 10000 - 3400);
      expect(inUsd.currency).toBe('USD');
      // 108 + 77 - 25.4
      expect(inUsd.netProfit).toBe(159.6);
    });

    it('falls back to USD when the owner has no workspace', async () => {
      workspaceCurrency(null);
      prisma.payment.findMany.mockResolvedValue([payment(100, 'EUR')]);
      prisma.expense.findMany.mockResolvedValue([expense(10, 'GBP')]);

      const summary = await service.summary(ownerId, {});

      expect(summary.currency).toBe('USD');
      expect(summary.netProfit).toBe(95.3);
    });

    it('counts money received, not money invoiced', async () => {
      prisma.invoice.findMany.mockResolvedValue([
        // 1,000 EUR invoiced and still unpaid: no effect on net profit.
        invoice({
          currency: 'EUR',
          items: [{ quantity: dec(1), rate: dec(1000) }],
        }),
      ]);
      prisma.payment.findMany.mockResolvedValue([payment(10, 'EUR')]);
      prisma.expense.findMany.mockResolvedValue([expense(500, 'KES')]);

      const summary = await service.summary(ownerId, {});

      expect(summary.invoiced).toBe(150000);
      expect(summary.outstanding).toBe(150000);
      expect(summary.netProfit).toBe(1000);
    });

    it('sums at the full rate and rounds only the reported figures', async () => {
      workspaceCurrency('USD');
      prisma.payment.findMany.mockResolvedValue([
        payment('33.33', 'EUR'), // 35.9964
        payment('33.33', 'EUR'), // 35.9964
        payment('0.10', 'USD'),
        payment('0.20', 'USD'), // 0.1 + 0.2 must not surface as 0.30000000000000004
      ]);
      prisma.expense.findMany.mockResolvedValue([
        expense('999.99', 'KES'), // 7.699923
      ]);

      const summary = await service.summary(ownerId, {});

      // 72.2928, not 72.30 as it would be with each payment rounded first.
      expect(summary.collected).toBe(72.29);
      expect(summary.expenses).toBe(7.7);
      expect(summary.netProfit).toBe(64.59);
    });

    it('does not inflate many small amounts in a weak currency', async () => {
      workspaceCurrency('USD');
      // 1 KES is 0.0077 USD: rounded per payment each would count as a whole cent.
      prisma.payment.findMany.mockResolvedValue(
        Array.from({ length: 100 }, () => payment(1, 'KES')),
      );
      prisma.expense.findMany.mockResolvedValue(
        Array.from({ length: 40 }, () => expense(1, 'KES')),
      );

      const summary = await service.summary(ownerId, {});

      expect(summary.collected).toBe(0.77);
      expect(summary.expenses).toBe(0.31);
      expect(summary.netProfit).toBe(0.46);
      expect(summary.monthly).toEqual([
        { month: '2026-07', collected: 0.77, expenses: 0.31 },
      ]);
      expect(summary.paymentsByCurrency).toEqual([
        { currency: 'KES', count: 100, amount: 100, converted: 0.77 },
      ]);
    });

    it('does not lose sub-cent amounts when totalling invoices', async () => {
      workspaceCurrency('USD');
      prisma.invoice.findMany.mockResolvedValue(
        Array.from({ length: 100 }, (_, n) =>
          invoice({
            id: `invoice-${n}`,
            items: [{ quantity: dec(1), rate: dec(1) }],
          }),
        ),
      );

      const summary = await service.summary(ownerId, {});

      expect(summary.invoiced).toBe(0.77);
      expect(summary.outstanding).toBe(0.77);
      expect(summary.avgInvoiceValue).toBe(0.01);
    });

    it('is zero for a period with no payments or expenses', async () => {
      const summary = await service.summary(ownerId, {});

      expect(summary).toEqual(
        expect.objectContaining({ collected: 0, expenses: 0, netProfit: 0 }),
      );
    });

    it('agrees with the monthly cash-flow rows it is charted against', async () => {
      prisma.payment.findMany.mockResolvedValue([
        payment(100, 'EUR', '2026-06-03'),
        payment(50, 'USD', '2026-07-20'),
        payment(4000, 'KES', '2026-07-21'),
      ]);
      prisma.expense.findMany.mockResolvedValue([
        expense(20, 'GBP', '2026-06-15'),
        expense(10, 'USD', '2026-07-01'),
      ]);

      const summary = await service.summary(ownerId, {});

      expect(summary.monthly).toEqual([
        { month: '2026-06', collected: 15000, expenses: 3400 },
        { month: '2026-07', collected: 10450, expenses: 1290 },
      ]);
      const fromMonths = summary.monthly.reduce(
        (sum, m) => sum + m.collected - m.expenses,
        0,
      );
      expect(summary.netProfit).toBe(fromMonths);
    });

    it('agrees with the converted per-currency and per-category breakdowns', async () => {
      prisma.payment.findMany.mockResolvedValue([
        payment(100, 'EUR'),
        payment(40, 'EUR'),
        payment(2000, 'KES'),
      ]);
      prisma.expense.findMany.mockResolvedValue([
        expense(20, 'GBP', '2026-07-12', 'travel'),
        expense(10, 'USD', '2026-07-12', 'software'),
      ]);

      const summary = await service.summary(ownerId, {});

      expect(summary.paymentsByCurrency).toEqual([
        { currency: 'EUR', count: 2, amount: 140, converted: 21000 },
        { currency: 'KES', count: 1, amount: 2000, converted: 2000 },
      ]);
      expect(summary.expensesByCategory).toEqual([
        { category: 'travel', amount: 3400 },
        { category: 'software', amount: 1290 },
      ]);
      const collected = summary.paymentsByCurrency.reduce(
        (sum, row) => sum + row.converted,
        0,
      );
      const spent = summary.expensesByCategory.reduce(
        (sum, row) => sum + row.amount,
        0,
      );
      expect(summary.netProfit).toBe(collected - spent);
    });
  });

  describe('net profit when a rate is unavailable', () => {
    it('fails the summary instead of reporting a partial figure', async () => {
      prisma.payment.findMany.mockResolvedValue([
        payment(5000, 'KES'),
        payment(100, 'CHF'), // no CHF->KES rate, and the rate service is down
      ]);
      prisma.expense.findMany.mockResolvedValue([expense(100, 'KES')]);

      const err = await service.summary(ownerId, {}).catch((e) => e);

      expect(err).toBeInstanceOf(HttpException);
      expect(err.getStatus()).toBe(HttpStatus.BAD_GATEWAY);
      expect(http.get).toHaveBeenCalledWith(
        'https://hexarate.paikama.co/api/rates/CHF/KES/latest',
      );
    });

    it('does not cache anything when conversion fails', async () => {
      prisma.expense.findMany.mockResolvedValue([expense(100, 'CHF')]);

      await service.summary(ownerId, {}).catch(() => undefined);

      expect(cache.set).not.toHaveBeenCalled();
    });
  });

  describe('net profit period', () => {
    it('limits payments and expenses to the requested dates, end day inclusive', async () => {
      await service.summary(ownerId, { from: '2026-07-01', to: '2026-07-31' });

      const range = {
        gte: new Date('2026-07-01'),
        lte: new Date('2026-07-31T23:59:59.999Z'),
      };
      expect(prisma.payment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { client: { workspace: { ownerId } }, date: range },
        }),
      );
      expect(prisma.expense.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workspace: { ownerId }, date: range },
        }),
      );
    });

    it('covers all time when no dates are given', async () => {
      const summary = await service.summary(ownerId, {});

      expect(summary.from).toBeNull();
      expect(summary.to).toBeNull();
      expect(prisma.payment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { client: { workspace: { ownerId } } },
        }),
      );
      expect(prisma.expense.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { workspace: { ownerId } } }),
      );
    });
  });

  describe('summary cache and the workspace currency', () => {
    it('caches per owner, currency and period for five minutes', async () => {
      prisma.payment.findMany.mockResolvedValue([payment(100, 'EUR')]);

      const summary = await service.summary(ownerId, {
        from: '2026-07-01',
        to: '2026-07-31',
      });

      expect(cache.set).toHaveBeenCalledWith(
        'reports_owner-1_all_KES_2026-07-01_2026-07-31',
        summary,
        CacheTimer.custom(5),
      );
    });

    it('serves a cached summary without re-reading or re-converting', async () => {
      const cached = { currency: 'KES', netProfit: 42 };
      cache.get.mockResolvedValue(cached);

      await expect(service.summary(ownerId, {})).resolves.toBe(cached);
      expect(cache.get).toHaveBeenCalledWith('reports_owner-1_all_KES_all_all');
      expect(prisma.payment.findMany).not.toHaveBeenCalled();
      expect(rateCache.get).not.toHaveBeenCalled();
    });

    it('does not serve a net profit converted into the previous workspace currency', async () => {
      const store = new Map<string, unknown>();
      cache.get.mockImplementation(async (key: string) => store.get(key));
      cache.set.mockImplementation(async (key: string, value: unknown) => {
        store.set(key, value);
      });
      prisma.payment.findMany.mockResolvedValue([payment(100, 'EUR')]);
      prisma.expense.findMany.mockResolvedValue([expense(20, 'GBP')]);

      workspaceCurrency('KES');
      const before = await service.summary(ownerId, {});
      workspaceCurrency('USD');
      const after = await service.summary(ownerId, {});

      expect(before).toEqual(
        expect.objectContaining({ currency: 'KES', netProfit: 11600 }),
      );
      expect(after).toEqual(
        expect.objectContaining({ currency: 'USD', netProfit: 82.6 }),
      );
      expect([...store.keys()]).toEqual([
        'reports_owner-1_all_KES_all_all',
        'reports_owner-1_all_USD_all_all',
      ]);
    });
  });
});
