import type { Mock } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { MilestoneBillingService } from './milestone-billing.service';

describe('MilestoneBillingService', () => {
  let service: MilestoneBillingService;
  let prisma: {
    milestone: { findFirst: Mock; aggregate: Mock; update: Mock };
  };
  let invoices: { create: Mock };
  let events: { emit: Mock };

  const ownerId = 'owner-1';
  const now = new Date('2026-11-10T09:00:00Z');

  const milestone = (overrides: Record<string, unknown> = {}) => ({
    id: 'm-1',
    name: 'M01 Technical assessment',
    status: 'accepted',
    amount: '50000',
    releasesRetention: false,
    acceptedAt: null,
    acceptedBy: null,
    invoice: null,
    project: {
      id: 'p-1',
      name: 'Griid Android',
      retentionPercent: '10',
      quote: { taxRate: '16' },
      client: {
        id: 'c-1',
        currency: 'KES',
        workspace: { paymentTerms: 14, taxRate: '0' },
      },
    },
    ...overrides,
  });

  beforeEach(() => {
    vi.useFakeTimers().setSystemTime(now);
    prisma = {
      milestone: {
        findFirst: vi.fn().mockResolvedValue(milestone()),
        aggregate: vi.fn().mockResolvedValue({ _sum: { retainedAmount: '0' } }),
        update: vi.fn(),
      },
    };
    invoices = {
      create: vi.fn(async () => ({ id: 'inv-1', number: 'INV-1001', status: 'draft' })),
    };
    events = { emit: vi.fn() };
    service = new MilestoneBillingService(prisma as any, invoices as any, events as any);
  });

  afterEach(() => vi.useRealTimers());

  it('bills the milestone net of retention and records what was held', async () => {
    await expect(service.invoice(ownerId, 'm-1')).resolves.toEqual({
      id: 'inv-1',
      number: 'INV-1001',
      status: 'draft',
    });

    const [, dto, links] = invoices.create.mock.calls[0];
    expect(links).toEqual({ milestoneId: 'm-1' });
    expect(dto).toMatchObject({
      clientId: 'c-1',
      projectId: 'p-1',
      currency: 'KES',
      taxRate: 16,
      items: [
        { description: 'M01 Technical assessment (less 10% retention)', quantity: 1, rate: 45000 },
      ],
    });
    expect(dto.dueDate).toBe('2026-11-24T09:00:00.000Z');
    expect(events.emit).toHaveBeenCalledWith(
      'milestone.invoiced',
      expect.objectContaining({ milestoneId: 'm-1', invoiceNumber: 'INV-1001', ownerId }),
    );
    expect(prisma.milestone.update).toHaveBeenCalledWith({
      where: { id: 'm-1' },
      data: { retainedAmount: 5000 },
    });
  });

  it('bills the full amount when the project holds no retention', async () => {
    const m = milestone();
    m.project.retentionPercent = '0';
    prisma.milestone.findFirst.mockResolvedValue(m);

    await service.invoice(ownerId, 'm-1');

    expect(invoices.create.mock.calls[0][1].items).toEqual([
      { description: 'M01 Technical assessment', quantity: 1, rate: 50000 },
    ]);
  });

  it('releases everything held on earlier milestones on the final one', async () => {
    prisma.milestone.findFirst.mockResolvedValue(
      milestone({ name: 'M09 Handover', amount: '40000', releasesRetention: true }),
    );
    prisma.milestone.aggregate.mockResolvedValue({ _sum: { retainedAmount: '36000' } });

    await service.invoice(ownerId, 'm-1');

    expect(prisma.milestone.aggregate.mock.calls[0][0].where).toMatchObject({
      projectId: 'p-1',
      id: { not: 'm-1' },
      invoice: { is: { status: { not: 'cancelled' } } },
    });
    expect(invoices.create.mock.calls[0][1].items).toEqual([
      { description: 'M09 Handover', quantity: 1, rate: 40000 },
      { description: 'Retention release (held on earlier milestones)', quantity: 1, rate: 36000 },
    ]);
    expect(prisma.milestone.update.mock.calls[0][0].data).toEqual({ retainedAmount: 0 });
  });

  it('falls back to the workspace tax rate for a project without a quote', async () => {
    const m = milestone();
    (m.project as any).quote = null;
    m.project.client.workspace.taxRate = '8';
    prisma.milestone.findFirst.mockResolvedValue(m);

    await service.invoice(ownerId, 'm-1');

    expect(invoices.create.mock.calls[0][1].taxRate).toBe(8);
  });

  it("404s a milestone that isn't the caller's", async () => {
    prisma.milestone.findFirst.mockResolvedValue(null);
    await expect(service.invoice(ownerId, 'm-9')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses to invoice a milestone twice', async () => {
    prisma.milestone.findFirst.mockResolvedValue(milestone({ invoice: { number: 'INV-7' } }));
    await expect(service.invoice(ownerId, 'm-1')).rejects.toBeInstanceOf(ConflictException);
    expect(invoices.create).not.toHaveBeenCalled();
  });

  it.each([
    ['unpriced', { amount: null }],
    ['cancelled', { status: 'cancelled' }],
  ])('refuses a %s milestone', async (_label, overrides) => {
    prisma.milestone.findFirst.mockResolvedValue(milestone(overrides));
    await expect(service.invoice(ownerId, 'm-1')).rejects.toBeInstanceOf(BadRequestException);
  });
});
