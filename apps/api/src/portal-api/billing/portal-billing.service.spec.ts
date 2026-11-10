import type { Mock } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { PortalBillingService } from './portal-billing.service';

describe('PortalBillingService', () => {
  let service: PortalBillingService;
  let prisma: {
    project: { findMany: Mock; findUnique: Mock };
    invoice: { findMany: Mock };
    payment: { groupBy: Mock };
  };
  let context: { require: Mock; sharedProjectIds: Mock };

  const now = new Date('2026-11-10T12:00:00Z');
  const invoice = (overrides: Record<string, unknown>) => ({
    id: 'inv',
    number: 'INV-1',
    status: 'sent',
    currency: 'KES',
    taxRate: '16',
    discount: '0',
    dueDate: new Date('2026-12-01'),
    items: [{ quantity: '1', rate: '100000' }],
    ...overrides,
  });

  beforeEach(() => {
    vi.useFakeTimers().setSystemTime(now);
    prisma = {
      project: {
        findMany: vi.fn().mockResolvedValue([{ id: 'p-1', name: 'Griid Android' }]),
        findUnique: vi.fn().mockResolvedValue({
          budget: '400000',
          client: { currency: 'KES' },
          milestones: [
            { retainedAmount: '10000', releasesRetention: false, invoice: { status: 'sent' } },
            { retainedAmount: '0', releasesRetention: true, invoice: null },
          ],
        }),
      },
      invoice: {
        findMany: vi.fn().mockResolvedValue([
          // overdue, part-paid
          invoice({ id: 'a', number: 'INV-1', dueDate: new Date('2026-11-01') }),
          // due later, unpaid - the next one due
          invoice({ id: 'b', number: 'INV-2', dueDate: new Date('2026-12-01') }),
          // other currency: counted separately, not summed
          invoice({ id: 'c', number: 'INV-3', currency: 'USD' }),
        ]),
      },
      payment: {
        groupBy: vi.fn().mockResolvedValue([{ invoiceId: 'a', _sum: { amount: '16000' } }]),
      },
    };
    context = {
      require: vi.fn().mockResolvedValue({ clientId: 'c-1' }),
      sharedProjectIds: vi.fn().mockResolvedValue(['p-1']),
    };
    service = new PortalBillingService(prisma as any, context as any);
  });

  afterEach(() => vi.useRealTimers());

  it('totals an invoice with the discount taken before tax', () => {
    expect(
      service.amounts({ items: [{ quantity: 2, rate: 100 }], discount: 50, taxRate: 10 }),
    ).toEqual({ net: 150, total: 165 });
  });

  it("reports the project's financial position in the client's currency", async () => {
    const f = await service.projectFinancials('portal-1', 'pu-1', 'p-1');

    expect(context.require).toHaveBeenCalledWith('portal-1', 'viewProjects');
    expect(context.require).toHaveBeenCalledWith('portal-1', 'viewPayments');
    expect(f).toEqual({
      currency: 'KES',
      budget: 400000,
      invoiced: 232000, // 2 x 116,000
      paid: 16000,
      outstanding: 216000,
      overdue: 100000, // INV-1's remaining balance
      remainingToInvoice: 200000, // budget is pre-tax: 400,000 - 2 x 100,000
      retentionHeld: 10000,
      invoiceCount: 2,
      otherCurrencyInvoices: 1,
      nextDue: { id: 'b', number: 'INV-2', dueDate: new Date('2026-12-01'), balance: 116000 },
    });
  });

  it('shows no retention held once the final milestone has been invoiced', async () => {
    prisma.project.findUnique.mockResolvedValue({
      budget: '0',
      client: { currency: 'KES' },
      milestones: [
        { retainedAmount: '10000', releasesRetention: false, invoice: { status: 'sent' } },
        { retainedAmount: '0', releasesRetention: true, invoice: { status: 'sent' } },
      ],
    });
    const f = await service.projectFinancials('portal-1', 'pu-1', 'p-1');
    expect(f.retentionHeld).toBe(0);
  });

  it("404s a project that isn't shared with the user", async () => {
    context.sharedProjectIds.mockResolvedValue([]);
    await expect(service.projectFinancials('portal-1', 'pu-1', 'p-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.invoice.findMany).not.toHaveBeenCalled();
  });

  it('names only the projects the user can see', async () => {
    const map = await service.visibleProjects('portal-1', 'pu-1');
    expect(prisma.project.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['p-1'] } },
      select: { id: true, name: true },
    });
    expect([...map.keys()]).toEqual(['p-1']);
  });
});
