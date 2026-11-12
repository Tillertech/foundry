import type { Mock } from 'vitest';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/client';
import { CreateQuoteDto } from './dto/create-quote.dto';
import { QuotesService } from './quotes.service';

describe('QuotesService', () => {
  let service: QuotesService;
  let prisma: any;
  let tx: any;
  let clients: { findOne: Mock };
  let projects: { insert: Mock; announceCreated: Mock };
  let billing: { invoice: Mock };

  const ownerId = 'owner-1';
  const line = (overrides: Record<string, unknown>) => ({
    id: 'line',
    description: 'Line',
    details: null,
    estimatedHours: null,
    deliverables: [],
    acceptanceCriteria: null,
    quantity: new Decimal(1),
    rate: new Decimal(0),
    kind: 'standard',
    selected: false,
    milestoneId: null,
    ...overrides,
  });
  const quote = (overrides: Record<string, unknown> = {}) => ({
    id: 'q-1',
    number: 'Q-2001',
    status: 'sent',
    currency: 'KES',
    taxRate: new Decimal(16),
    retentionPercent: new Decimal(10),
    clientId: 'c-1',
    projectId: null,
    items: [
      line({
        id: 'a',
        kind: 'milestone',
        description: 'M01',
        rate: new Decimal(50000),
        estimatedHours: 20,
        details: 'Scope',
        deliverables: [{ id: 'd1', label: 'Feature list' }],
        acceptanceCriteria: 'Client signs off the feature list',
      }),
      line({
        id: 'b',
        kind: 'milestone',
        description: 'M02',
        quantity: new Decimal(2),
        rate: new Decimal(10000),
      }),
      line({
        id: 'c',
        kind: 'recurring',
        description: 'Support',
        rate: new Decimal(25000),
      }),
      line({
        id: 'd',
        kind: 'option',
        description: 'iOS',
        rate: new Decimal(100000),
        selected: true,
      }),
      line({
        id: 'e',
        kind: 'option',
        description: 'Social',
        rate: new Decimal(80000),
      }),
      line({
        id: 'f',
        kind: 'pass_through',
        description: 'Hosting',
        rate: new Decimal(3000),
      }),
    ],
    ...overrides,
  });

  beforeEach(() => {
    let n = 0;
    tx = {
      milestone: {
        create: vi.fn(async ({ data }) => ({ id: `m-${n++}`, ...data })),
      },
      quoteItem: { update: vi.fn() },
      quote: {
        update: vi.fn(async ({ data }) => ({
          ...quote(),
          ...data,
          // Mirrors the links written above: lines a, b, d became m-0..m-2.
          items: quote().items.map((it) => {
            const i = ['a', 'b', 'd'].indexOf(it.id);
            return i >= 0 ? { ...it, milestoneId: `m-${i}` } : it;
          }),
        })),
      },
    };
    prisma = {
      quote: { findFirst: vi.fn().mockResolvedValue(quote()) },
      $transaction: vi.fn(async (fn: (t: unknown) => unknown) => fn(tx)),
    };
    clients = {
      findOne: vi.fn().mockResolvedValue({
        id: 'c-1',
        name: 'Griid',
        currency: 'KES',
        workspaceId: 'ws-1',
      }),
    };
    projects = {
      insert: vi.fn(async (_db, dto) => ({ id: 'p-1', ...dto })),
      announceCreated: vi.fn(),
    };
    billing = {
      invoice: vi.fn().mockResolvedValue({
        id: 'inv-1',
        number: 'INV-1001',
        status: 'draft',
      }),
    };
    service = new QuotesService(
      prisma,
      {} as any,
      clients as any,
      { emit: vi.fn() } as any,
      {} as any,
      projects as any,
      billing as any,
    );
  });

  const dto = { name: 'Griid Android', startDate: '2026-11-17' };

  describe('create (numbering)', () => {
    const body: CreateQuoteDto = {
      clientId: 'c-1',
      issueDate: '2026-11-11',
      validUntil: '2026-12-11',
      items: [{ description: 'Discovery', quantity: 1, rate: 500 }],
    };
    const taken = () =>
      Object.assign(new Error('unique'), {
        code: 'P2002',
        meta: { target: ['workspaceId', 'number'] },
      });

    beforeEach(() => {
      prisma.quote.create = vi.fn(async ({ data }) => ({
        id: 'q-new',
        ...data,
      }));
      prisma.quote.findMany = vi.fn().mockResolvedValue([]);
      prisma.workspace = {
        findUnique: vi.fn().mockResolvedValue({ quotePrefix: null }),
      };
    });

    it("files the quote under its client's workspace", async () => {
      await service.create(ownerId, body);
      expect(prisma.quote.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            workspaceId: 'ws-1',
            number: 'Q-2001',
          }),
        }),
      );
    });

    it("continues the workspace's own sequence with its prefix, numerically", async () => {
      prisma.workspace.findUnique.mockResolvedValue({ quotePrefix: 'EST-' });
      prisma.quote.findMany.mockResolvedValue([
        { number: 'EST-999' },
        { number: 'EST-2001' },
        { number: 'EST-draft' },
      ]);
      await service.create(ownerId, body);
      expect(prisma.quote.findMany).toHaveBeenCalledWith({
        where: { workspaceId: 'ws-1', number: { startsWith: 'EST-' } },
        select: { number: true },
      });
      expect(prisma.quote.create.mock.calls[0][0].data.number).toBe('EST-2002');
    });

    it('retries a generated number another create took first', async () => {
      prisma.quote.create
        .mockRejectedValueOnce(taken())
        .mockImplementationOnce(async ({ data }) => ({ id: 'q-new', ...data }));
      await expect(service.create(ownerId, body)).resolves.toEqual(
        expect.objectContaining({ id: 'q-new' }),
      );
      expect(prisma.quote.create).toHaveBeenCalledTimes(2);
    });

    it('409s a typed number the workspace already uses, without retrying', async () => {
      prisma.quote.create.mockRejectedValue(taken());
      await expect(
        service.create(ownerId, { ...body, number: 'Q-7' }),
      ).rejects.toThrow(/Q-7 is already in use in this workspace/);
      expect(prisma.quote.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('convert', () => {
    it('creates the project with the one-off subtotal as budget and the quoted retention', async () => {
      await service.convert(ownerId, 'q-1', dto);

      // 50,000 + 2 x 10,000 + selected option 100,000 - recurring, pass-through and unselected options excluded.
      expect(projects.insert).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({
          name: 'Griid Android',
          clientId: 'c-1',
          budget: 170000,
          retentionPercent: 10,
        }),
      );
      expect(projects.announceCreated).toHaveBeenCalledWith(
        ownerId,
        'ws-1',
        'p-1',
      );
    });

    it('turns milestone lines and picked options into priced milestones, options before the hand-over', async () => {
      const result = await service.convert(ownerId, 'q-1', dto);

      const created = tx.milestone.create.mock.calls.map(([{ data }]: any) => ({
        name: data.name,
        amount: Number(data.amount),
        order: data.order,
        releasesRetention: data.releasesRetention,
      }));
      // The last milestone line stays final (it releases retention); the
      // picked option is delivered before it.
      expect(created).toEqual([
        { name: 'M01', amount: 50000, order: 0, releasesRetention: false },
        { name: 'iOS', amount: 100000, order: 1, releasesRetention: false },
        { name: 'M02', amount: 20000, order: 2, releasesRetention: true },
      ]);
      expect(tx.milestone.create.mock.calls[0][0].data).toMatchObject({
        description: 'Scope',
        estimatedHours: 20,
        billingTrigger: 'on_acceptance',
        // What the client accepted is the checklist they later sign off.
        deliverables: [{ id: 'd1', label: 'Feature list', done: false }],
        acceptanceCriteria: 'Client signs off the feature list',
      });
      expect(tx.quoteItem.update).toHaveBeenCalledWith({
        where: { id: 'a' },
        data: { milestoneId: 'm-0' },
      });
      expect(tx.quote.update.mock.calls[0][0].data).toEqual({
        status: 'accepted',
        projectId: 'p-1',
      });
      expect(result).toMatchObject({
        milestoneCount: 3,
        upfrontInvoiceNumber: null,
      });
      expect(billing.invoice).not.toHaveBeenCalled();
    });

    it('raises the first milestone invoice upfront when asked', async () => {
      const result = await service.convert(ownerId, 'q-1', {
        ...dto,
        invoiceFirstMilestone: true,
      });

      expect(tx.milestone.create.mock.calls[0][0].data.billingTrigger).toBe(
        'upfront',
      );
      expect(billing.invoice).toHaveBeenCalledWith(ownerId, 'm-0');
      expect(result.upfrontInvoiceNumber).toBe('INV-1001');
    });

    it('still returns the project when the upfront invoice fails', async () => {
      billing.invoice.mockRejectedValue(new Error('boom'));

      const result = await service.convert(ownerId, 'q-1', {
        ...dto,
        invoiceFirstMilestone: true,
      });

      expect(result.project).toMatchObject({ id: 'p-1' });
      expect(result.upfrontInvoiceNumber).toBeNull();
    });

    it('does not flag a retention-releasing milestone when nothing is retained', async () => {
      prisma.quote.findFirst.mockResolvedValue(
        quote({ retentionPercent: new Decimal(0) }),
      );

      await service.convert(ownerId, 'q-1', dto);

      expect(
        tx.milestone.create.mock.calls.every(
          ([{ data }]: any) => !data.releasesRetention,
        ),
      ).toBe(true);
    });

    it('refuses a quote that was already converted', async () => {
      prisma.quote.findFirst.mockResolvedValue(quote({ projectId: 'p-0' }));
      await expect(service.convert(ownerId, 'q-1', dto)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it.each(['declined', 'expired'])('refuses a %s quote', async (status) => {
      prisma.quote.findFirst.mockResolvedValue(quote({ status }));
      await expect(service.convert(ownerId, 'q-1', dto)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it("refuses a quote whose currency isn't the client's", async () => {
      prisma.quote.findFirst.mockResolvedValue(quote({ currency: 'USD' }));
      await expect(service.convert(ownerId, 'q-1', dto)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('locks lines of a quote the client accepted', async () => {
      prisma.quote.findFirst.mockResolvedValue(
        quote({ status: 'accepted', respondedAt: new Date() }),
      );
      await expect(
        service.update(ownerId, 'q-1', {
          items: [{ description: 'x', quantity: 1, rate: 1 }],
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('clears the client answer when the owner reopens the quote', async () => {
      prisma.quote.findFirst.mockResolvedValue(
        quote({
          status: 'accepted',
          respondedAt: new Date(),
          respondedBy: 'Ada',
        }),
      );
      prisma.quote.update = vi.fn(async ({ data }) => ({
        ...quote(),
        ...data,
      }));

      await service.update(ownerId, 'q-1', { status: 'sent' });

      expect(prisma.quote.update.mock.calls[0][0].data).toMatchObject({
        status: 'sent',
        respondedAt: null,
        respondedBy: null,
        responseNote: null,
      });
    });

    it('locks the attachments of a converted quote', async () => {
      prisma.quote.findFirst.mockResolvedValue(quote({ projectId: 'p-1' }));
      await expect(
        service.update(ownerId, 'q-1', { attachmentIds: [] }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it("refuses attachments that aren't the client's documents", async () => {
      prisma.document = { count: vi.fn().mockResolvedValue(1) };
      prisma.quote.update = vi.fn();
      await expect(
        service.update(ownerId, 'q-1', {
          attachmentIds: [
            '11111111-1111-1111-1111-111111111111',
            '22222222-2222-2222-2222-222222222222',
          ],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.document.count.mock.calls[0][0].where.OR).toEqual([
        { clientId: 'c-1' },
        { project: { clientId: 'c-1' } },
      ]);
      expect(prisma.quote.update).not.toHaveBeenCalled();
    });

    it('keeps scope only on lines that become milestones', async () => {
      prisma.quote.update = vi.fn(async ({ data }) => ({
        ...quote(),
        ...data,
      }));
      const scope = {
        deliverables: [
          { id: 'x', label: '  Build  ' },
          { id: 'x', label: 'Duplicate' },
          { id: 'y', label: '   ' },
        ],
        acceptanceCriteria: ' Works ',
      };
      await service.update(ownerId, 'q-1', {
        items: [
          {
            description: 'M',
            quantity: 1,
            rate: 1,
            kind: 'milestone',
            ...scope,
          },
          {
            description: 'S',
            quantity: 1,
            rate: 1,
            kind: 'standard',
            ...scope,
          },
        ],
      });
      const rows = prisma.quote.update.mock.calls[0][0].data.items.create;
      expect(rows[0]).toMatchObject({
        deliverables: [{ id: 'x', label: 'Build' }],
        acceptanceCriteria: 'Works',
      });
      expect(rows[1]).toMatchObject({
        deliverables: [],
        acceptanceCriteria: null,
      });
    });

    it('locks the lines of a converted quote', async () => {
      prisma.quote.findFirst.mockResolvedValue(quote({ projectId: 'p-1' }));
      await expect(
        service.update(ownerId, 'q-1', {
          items: [{ description: 'x', quantity: 1, rate: 1 }],
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
