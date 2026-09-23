import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { CacheTimer } from '../common/cache-timer';
import { InvoiceEvents } from '../common/events';
import { Prisma } from '../generated/prisma/client';
import { InvoicesService } from './invoices.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';

function uniqueError(field: string) {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { target: [field] },
  });
}
const duplicateNumberError = () => uniqueError('number');
const duplicateExpenseError = () => uniqueError('expenseId');

describe('InvoicesService', () => {
  let service: InvoicesService;
  let prisma: {
    invoice: {
      create: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    expense: { findMany: jest.Mock };
    workspace: { findUnique: jest.Mock; findFirst: jest.Mock };
  };
  let pagination: { paginate: jest.Mock };
  let clients: { findOne: jest.Mock };
  let projects: { findOne: jest.Mock };
  let events: { emit: jest.Mock };
  let cache: { get: jest.Mock; set: jest.Mock };
  let http: { get: jest.Mock };

  const ownerId = 'owner-1';
  const client = { id: 'client-1', workspaceId: 'ws-1' };
  const baseDto: CreateInvoiceDto = {
    clientId: client.id,
    issueDate: '2026-01-01',
    dueDate: '2026-01-15',
    items: [{ description: 'Work', quantity: 1, rate: 100 }],
  };

  /** An invoice as findOne() loads it. */
  const invoice = (overrides: Record<string, unknown> = {}) => ({
    id: 'invoice-1',
    number: 'INV-1001',
    status: 'draft',
    currency: 'USD',
    clientId: client.id,
    projectId: null,
    items: [],
    project: null,
    ...overrides,
  });

  /** A billable expense as resolveItems() queries it. */
  const expense = (overrides: Record<string, unknown> = {}) => ({
    id: 'expense-1',
    vendor: 'Figma',
    amount: new Prisma.Decimal('45.50'),
    currency: 'USD',
    billable: true,
    project: { clientId: client.id },
    invoiceItem: null,
    ...overrides,
  });

  const echoCreate = () =>
    prisma.invoice.create.mockImplementation(async ({ data }) => ({
      ...data,
    }));

  beforeEach(() => {
    prisma = {
      invoice: {
        create: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      expense: { findMany: jest.fn().mockResolvedValue([]) },
      workspace: {
        findUnique: jest.fn().mockResolvedValue({ invoicePrefix: null }),
        findFirst: jest.fn(),
      },
    };
    pagination = { paginate: jest.fn() };
    clients = { findOne: jest.fn().mockResolvedValue(client) };
    projects = {
      findOne: jest
        .fn()
        .mockResolvedValue({ id: 'project-1', clientId: client.id }),
    };
    events = { emit: jest.fn() };
    cache = { get: jest.fn(), set: jest.fn() };
    http = { get: jest.fn() };

    service = new InvoicesService(
      prisma as any,
      pagination as any,
      clients as any,
      projects as any,
      events as any,
      cache as any,
      http as any,
    );
  });

  describe('numbering', () => {
    beforeEach(echoCreate);

    it('starts a fresh workspace sequence at 1001 with the default prefix', async () => {
      const result = await service.create(ownerId, baseDto);

      expect(result.number).toBe('INV-1001');
    });

    it('applies the workspace invoicePrefix when set', async () => {
      prisma.workspace.findUnique.mockResolvedValue({ invoicePrefix: 'ACME-' });

      const result = await service.create(ownerId, baseDto);

      expect(result.number).toBe('ACME-1001');
    });

    it('falls back to the default prefix when the custom one is blank', async () => {
      prisma.workspace.findUnique.mockResolvedValue({ invoicePrefix: '   ' });

      const result = await service.create(ownerId, baseDto);

      expect(result.number).toBe('INV-1001');
    });

    it("scopes the lookup to the invoice owner's workspace, not every workspace", async () => {
      await service.create(ownerId, baseDto);

      expect(prisma.workspace.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: client.workspaceId } }),
      );
      expect(prisma.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            workspaceId: client.workspaceId,
          }),
        }),
      );
    });

    it('picks the true numeric max past a power-of-ten boundary (not a string sort)', async () => {
      // A naive `ORDER BY number DESC` (or plain string-max) ranks "INV-999"
      // above "INV-1000"; a workspace whose highest number is already
      // INV-9999 must still be handed INV-10000, not a stale/duplicate value.
      prisma.invoice.findMany.mockResolvedValue([
        { number: 'INV-1000' },
        { number: 'INV-999' },
        { number: 'INV-9999' },
        { number: 'INV-2000' },
      ]);

      const result = await service.create(ownerId, baseDto);

      expect(result.number).toBe('INV-10000');
    });

    it('ignores a manually-set, non-numeric suffix sharing the prefix', async () => {
      prisma.invoice.findMany.mockResolvedValue([
        { number: 'INV-1002' },
        { number: 'INV-CUSTOM' },
      ]);

      const result = await service.create(ownerId, baseDto);

      expect(result.number).toBe('INV-1003');
    });

    it('continues a sequence that started below the default start', async () => {
      prisma.invoice.findMany.mockResolvedValue([{ number: 'INV-7' }]);

      const result = await service.create(ownerId, baseDto);

      expect(result.number).toBe('INV-8');
    });

    it('does not look up a number when the caller supplies one', async () => {
      const result = await service.create(ownerId, {
        ...baseDto,
        number: 'CUSTOM-1',
      });

      expect(result.number).toBe('CUSTOM-1');
      expect(prisma.workspace.findUnique).not.toHaveBeenCalled();
      expect(prisma.invoice.findMany).not.toHaveBeenCalled();
    });
  });

  describe('conflict handling', () => {
    it('retries with a fresh number when the generated one collides', async () => {
      prisma.invoice.findMany
        .mockResolvedValueOnce([]) // attempt 1 - INV-1001
        .mockResolvedValueOnce([{ number: 'INV-1001' }]); // attempt 2 - INV-1002
      prisma.invoice.create
        .mockRejectedValueOnce(duplicateNumberError())
        .mockImplementationOnce(async ({ data }) => ({ ...data }));

      const result = await service.create(ownerId, baseDto);

      expect(result.number).toBe('INV-1002');
      expect(prisma.invoice.create).toHaveBeenCalledTimes(2);
    });

    it('gives up after repeated collisions with a 409, not a raw 500', async () => {
      prisma.invoice.create.mockRejectedValue(duplicateNumberError());

      await expect(service.create(ownerId, baseDto)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.invoice.create).toHaveBeenCalledTimes(5);
    });

    it('converts a duplicate caller-supplied number into a 409', async () => {
      prisma.invoice.create.mockRejectedValue(duplicateNumberError());

      await expect(
        service.create(ownerId, { ...baseDto, number: 'INV-1001' }),
      ).rejects.toThrow('Invoice number already exists');
      // Explicit numbers are trusted as-is - no retry loop burning extra numbers.
      expect(prisma.invoice.create).toHaveBeenCalledTimes(1);
    });

    it('does not retry numbering when the conflict is a concurrently billed expense', async () => {
      prisma.invoice.create.mockRejectedValue(duplicateExpenseError());

      await expect(service.create(ownerId, baseDto)).rejects.toThrow(
        'One of the expenses was just billed on another invoice',
      );
      expect(prisma.invoice.create).toHaveBeenCalledTimes(1);
    });

    it('reports a billed-expense conflict on an explicit number as such, not as a duplicate number', async () => {
      prisma.invoice.create.mockRejectedValue(duplicateExpenseError());

      await expect(
        service.create(ownerId, { ...baseDto, number: 'CUSTOM-1' }),
      ).rejects.toThrow('One of the expenses was just billed on another invoice');
    });

    it('does not swallow unrelated database errors', async () => {
      const boom = new Error('connection reset');
      prisma.invoice.create.mockRejectedValue(boom);

      await expect(service.create(ownerId, baseDto)).rejects.toBe(boom);
    });

    it('does not swallow non-unique Prisma errors', async () => {
      const fk = new Prisma.PrismaClientKnownRequestError('FK failed', {
        code: 'P2003',
        clientVersion: 'test',
      });
      prisma.invoice.create.mockRejectedValue(fk);

      await expect(service.create(ownerId, baseDto)).rejects.toBe(fk);
      expect(prisma.invoice.create).toHaveBeenCalledTimes(1);
    });

    it('converts a duplicate number from an edit into a 409, not a raw 500', async () => {
      prisma.invoice.findFirst.mockResolvedValue(invoice());
      prisma.invoice.update.mockRejectedValue(duplicateNumberError());

      await expect(
        service.update(ownerId, 'invoice-1', { number: 'INV-1001' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('converts a concurrently billed expense on an edit into a 409', async () => {
      prisma.invoice.findFirst.mockResolvedValue(invoice());
      prisma.expense.findMany.mockResolvedValue([expense()]);
      prisma.invoice.update.mockRejectedValue(duplicateExpenseError());

      await expect(
        service.update(ownerId, 'invoice-1', {
          items: [
            { description: 'Figma', quantity: 1, rate: 1, expenseId: 'expense-1' },
          ],
        }),
      ).rejects.toThrow('One of the expenses was just billed on another invoice');
    });
  });

  describe('create', () => {
    beforeEach(echoCreate);

    it('validates the client and project belong to the caller before creating', async () => {
      await service.create(ownerId, { ...baseDto, projectId: 'project-1' });

      expect(clients.findOne).toHaveBeenCalledWith(ownerId, client.id);
      expect(projects.findOne).toHaveBeenCalledWith(ownerId, 'project-1');
    });

    it("rejects a project that belongs to a different client than the invoice's", async () => {
      projects.findOne.mockResolvedValue({
        id: 'project-9',
        clientId: 'client-9',
      });

      await expect(
        service.create(ownerId, { ...baseDto, projectId: 'project-9' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.invoice.create).not.toHaveBeenCalled();
    });

    it('propagates a missing client without creating anything', async () => {
      clients.findOne.mockRejectedValue(new NotFoundException('Client not found'));

      await expect(service.create(ownerId, baseDto)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.invoice.create).not.toHaveBeenCalled();
    });

    it("stamps the client's workspace and nests the line items", async () => {
      await service.create(ownerId, baseDto);

      expect(prisma.invoice.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            clientId: client.id,
            workspaceId: client.workspaceId,
            items: {
              create: [{ description: 'Work', quantity: 1, rate: 100 }],
            },
          }),
        }),
      );
    });

    it('loads each line with its billed expense summary and the project name', async () => {
      await service.create(ownerId, baseDto);

      expect(prisma.invoice.create).toHaveBeenCalledWith(
        expect.objectContaining({
          include: {
            items: {
              include: {
                expense: {
                  select: { vendor: true, category: true, date: true },
                },
              },
            },
            project: { select: { name: true } },
          },
        }),
      );
    });
  });

  describe('billable expense lines', () => {
    const expenseLine = (expenseId = 'expense-1', extra = {}) => ({
      description: 'Figma · Software',
      quantity: 5,
      rate: 999,
      expenseId,
      ...extra,
    });

    beforeEach(echoCreate);

    const createdItems = () =>
      prisma.invoice.create.mock.calls[0][0].data.items.create;

    it('skips the expense lookup entirely when no line re-bills an expense', async () => {
      await service.create(ownerId, baseDto);

      expect(prisma.expense.findMany).not.toHaveBeenCalled();
    });

    it("pins an expense line to 1 x the expense amount, whatever the request says", async () => {
      prisma.expense.findMany.mockResolvedValue([expense()]);

      await service.create(ownerId, {
        ...baseDto,
        items: [...baseDto.items, expenseLine()],
      });

      expect(createdItems()).toEqual([
        { description: 'Work', quantity: 1, rate: 100 },
        {
          description: 'Figma · Software',
          quantity: 1,
          rate: new Prisma.Decimal('45.50'),
          expense: { connect: { id: 'expense-1' } },
        },
      ]);
    });

    it("only looks up expenses within the caller's workspaces", async () => {
      prisma.expense.findMany.mockResolvedValue([expense()]);

      await service.create(ownerId, { ...baseDto, items: [expenseLine()] });

      expect(prisma.expense.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: { in: ['expense-1'] },
            project: { client: { workspace: { ownerId } } },
          },
        }),
      );
    });

    it("404s an expense that doesn't exist or isn't the caller's", async () => {
      prisma.expense.findMany.mockResolvedValue([]);

      await expect(
        service.create(ownerId, { ...baseDto, items: [expenseLine()] }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.invoice.create).not.toHaveBeenCalled();
    });

    it('rejects an expense not marked billable', async () => {
      prisma.expense.findMany.mockResolvedValue([expense({ billable: false })]);

      await expect(
        service.create(ownerId, { ...baseDto, items: [expenseLine()] }),
      ).rejects.toThrow('Expense from Figma is not marked billable');
    });

    it("rejects an expense on a different client's project", async () => {
      prisma.expense.findMany.mockResolvedValue([
        expense({ project: { clientId: 'client-9' } }),
      ]);

      await expect(
        service.create(ownerId, { ...baseDto, items: [expenseLine()] }),
      ).rejects.toThrow("belongs to a different client's project");
    });

    it('rejects an expense in a different currency than the invoice', async () => {
      prisma.expense.findMany.mockResolvedValue([expense({ currency: 'EUR' })]);

      await expect(
        service.create(ownerId, {
          ...baseDto,
          currency: 'USD',
          items: [expenseLine()],
        }),
      ).rejects.toThrow('is in EUR, not the invoice currency USD');
    });

    it('treats an invoice created without a currency as USD (the schema default)', async () => {
      prisma.expense.findMany.mockResolvedValue([expense({ currency: 'KES' })]);

      await expect(
        service.create(ownerId, { ...baseDto, items: [expenseLine()] }),
      ).rejects.toThrow('not the invoice currency USD');
    });

    it('accepts an expense in a matching non-default currency', async () => {
      prisma.expense.findMany.mockResolvedValue([expense({ currency: 'KES' })]);

      await expect(
        service.create(ownerId, {
          ...baseDto,
          currency: 'KES',
          items: [expenseLine()],
        }),
      ).resolves.toBeDefined();
    });

    it('409s an expense already billed on another invoice', async () => {
      prisma.expense.findMany.mockResolvedValue([
        expense({ invoiceItem: { invoiceId: 'invoice-other' } }),
      ]);

      await expect(
        service.create(ownerId, { ...baseDto, items: [expenseLine()] }),
      ).rejects.toThrow('Expense from Figma is already billed on another invoice');
    });

    it('rejects the same expense twice on one invoice before hitting the database', async () => {
      await expect(
        service.create(ownerId, {
          ...baseDto,
          items: [expenseLine(), expenseLine()],
        }),
      ).rejects.toThrow('An expense can only be billed once');
      expect(prisma.expense.findMany).not.toHaveBeenCalled();
    });

    it('allows an invoice made up only of expense lines', async () => {
      prisma.expense.findMany.mockResolvedValue([
        expense(),
        expense({ id: 'expense-2', vendor: 'Uber', amount: 12 }),
      ]);

      await service.create(ownerId, {
        ...baseDto,
        items: [expenseLine('expense-1'), expenseLine('expense-2')],
      });

      expect(createdItems()).toHaveLength(2);
      expect(createdItems()[1]).toEqual(
        expect.objectContaining({ rate: 12, quantity: 1 }),
      );
    });
  });

  describe('findAll', () => {
    it('scopes to the owner and passes through the filters', async () => {
      pagination.paginate.mockResolvedValue({ results: [] });

      await service.findAll(
        ownerId,
        {
          clientId: 'client-1',
          projectId: 'project-1',
          status: 'sent',
          take: 10,
          cursor: 'c1',
        } as any,
        'http://api/invoices',
      );

      expect(pagination.paginate).toHaveBeenCalledWith(
        prisma.invoice,
        expect.objectContaining({
          where: {
            client: { workspace: { ownerId } },
            clientId: 'client-1',
            projectId: 'project-1',
            status: 'sent',
          },
        }),
        {
          cursor: 'c1',
          take: 10,
          orderBy: { createdAt: 'desc' },
          baseUrl: 'http://api/invoices',
          includeCount: true,
        },
      );
    });

    it('omits filters that were not supplied', async () => {
      await service.findAll(ownerId, {} as any, 'http://api/invoices');

      expect(pagination.paginate.mock.calls[0][1].where).toEqual({
        client: { workspace: { ownerId } },
      });
    });
  });

  describe('findOne', () => {
    it("looks the invoice up through the owner's workspace", async () => {
      prisma.invoice.findFirst.mockResolvedValue(invoice());

      await expect(service.findOne(ownerId, 'invoice-1')).resolves.toEqual(
        invoice(),
      );
      expect(prisma.invoice.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'invoice-1', client: { workspace: { ownerId } } },
        }),
      );
    });

    it("404s an invoice that doesn't exist or isn't the caller's", async () => {
      prisma.invoice.findFirst.mockResolvedValue(null);

      await expect(service.findOne(ownerId, 'nope')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    beforeEach(() => {
      prisma.invoice.findFirst.mockResolvedValue(invoice());
      prisma.invoice.update.mockImplementation(async ({ data }) => ({
        ...invoice(),
        ...data,
      }));
    });

    const updateData = () => prisma.invoice.update.mock.calls[0][0].data;

    it("404s an invoice that isn't the caller's without writing", async () => {
      prisma.invoice.findFirst.mockResolvedValue(null);

      await expect(
        service.update(ownerId, 'nope', { notes: 'x' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.invoice.update).not.toHaveBeenCalled();
    });

    it('leaves the line items alone when none are sent', async () => {
      await service.update(ownerId, 'invoice-1', { notes: 'Net 14' });

      expect(updateData()).toEqual({ notes: 'Net 14' });
      expect(prisma.expense.findMany).not.toHaveBeenCalled();
    });

    it('replaces every line item when items are sent', async () => {
      await service.update(ownerId, 'invoice-1', {
        items: [{ description: 'New work', quantity: 2, rate: 50 }],
      });

      expect(updateData().items).toEqual({
        deleteMany: {},
        create: [{ description: 'New work', quantity: 2, rate: 50 }],
      });
    });

    it("rejects moving the invoice onto a different client's project", async () => {
      projects.findOne.mockResolvedValue({
        id: 'project-9',
        clientId: 'client-9',
      });

      await expect(
        service.update(ownerId, 'invoice-1', { projectId: 'project-9' }),
      ).rejects.toThrow("Project belongs to a different client than the invoice's");
      expect(prisma.invoice.update).not.toHaveBeenCalled();
    });

    it("accepts a project on the invoice's own client", async () => {
      await service.update(ownerId, 'invoice-1', { projectId: 'project-1' });

      expect(projects.findOne).toHaveBeenCalledWith(ownerId, 'project-1');
      expect(updateData()).toEqual({ projectId: 'project-1' });
    });

    it('keeps the expense lines the invoice already bills when re-saved', async () => {
      prisma.expense.findMany.mockResolvedValue([
        expense({ invoiceItem: { invoiceId: 'invoice-1' } }),
      ]);

      await service.update(ownerId, 'invoice-1', {
        items: [
          { description: 'Figma', quantity: 1, rate: 45.5, expenseId: 'expense-1' },
        ],
      });

      expect(updateData().items.create).toEqual([
        {
          description: 'Figma',
          quantity: 1,
          rate: new Prisma.Decimal('45.50'),
          expense: { connect: { id: 'expense-1' } },
        },
      ]);
    });

    it("validates new expense lines against the invoice's own client and currency", async () => {
      prisma.invoice.findFirst.mockResolvedValue(invoice({ currency: 'EUR' }));
      prisma.expense.findMany.mockResolvedValue([expense({ currency: 'USD' })]);

      await expect(
        service.update(ownerId, 'invoice-1', {
          items: [
            { description: 'Figma', quantity: 1, rate: 1, expenseId: 'expense-1' },
          ],
        }),
      ).rejects.toThrow('not the invoice currency EUR');
    });

    it('validates expense lines against a currency changed in the same edit', async () => {
      prisma.expense.findMany.mockResolvedValue([expense({ currency: 'EUR' })]);

      await service.update(ownerId, 'invoice-1', {
        currency: 'EUR',
        items: [
          { description: 'Hotel', quantity: 1, rate: 1, expenseId: 'expense-1' },
        ],
      });

      expect(updateData().currency).toBe('EUR');
    });

    it('blocks a currency switch that would strand the existing expense lines', async () => {
      prisma.invoice.findFirst.mockResolvedValue(
        invoice({
          items: [
            {
              description: 'Figma',
              quantity: new Prisma.Decimal(1),
              rate: new Prisma.Decimal('45.50'),
              expenseId: 'expense-1',
            },
          ],
        }),
      );
      prisma.expense.findMany.mockResolvedValue([
        expense({ invoiceItem: { invoiceId: 'invoice-1' } }),
      ]);

      await expect(
        service.update(ownerId, 'invoice-1', { currency: 'EUR' }),
      ).rejects.toThrow('not the invoice currency EUR');
      expect(prisma.invoice.update).not.toHaveBeenCalled();
    });

    it('allows a currency switch when no line re-bills an expense, without rewriting items', async () => {
      prisma.invoice.findFirst.mockResolvedValue(
        invoice({
          items: [
            {
              description: 'Work',
              quantity: new Prisma.Decimal(1),
              rate: new Prisma.Decimal(100),
              expenseId: null,
            },
          ],
        }),
      );

      await service.update(ownerId, 'invoice-1', { currency: 'EUR' });

      expect(updateData()).toEqual({ currency: 'EUR' });
    });

    it('does not re-validate expenses when the currency is sent unchanged', async () => {
      await service.update(ownerId, 'invoice-1', { currency: 'USD' });

      expect(prisma.expense.findMany).not.toHaveBeenCalled();
      expect(updateData()).toEqual({ currency: 'USD' });
    });
  });

  describe('remove', () => {
    it('deletes the invoice and returns it as it was', async () => {
      prisma.invoice.findFirst.mockResolvedValue(invoice());

      await expect(service.remove(ownerId, 'invoice-1')).resolves.toEqual(
        invoice(),
      );
      expect(prisma.invoice.delete).toHaveBeenCalledWith({
        where: { id: 'invoice-1' },
      });
    });

    it("404s an invoice that isn't the caller's without deleting", async () => {
      prisma.invoice.findFirst.mockResolvedValue(null);

      await expect(service.remove(ownerId, 'nope')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.invoice.delete).not.toHaveBeenCalled();
    });
  });

  describe('send', () => {
    const clientRow = { id: client.id, email: 'billing@globex.test' };

    beforeEach(() => {
      // The row as stored, with whatever the update changed applied on top.
      prisma.invoice.update.mockImplementation(async ({ data }) => ({
        ...(await prisma.invoice.findFirst.mock.results[0].value),
        ...data,
        client: clientRow,
      }));
    });

    it('moves a draft to sent', async () => {
      prisma.invoice.findFirst.mockResolvedValue(invoice({ status: 'draft' }));

      const result = await service.send(ownerId, 'invoice-1');

      expect(prisma.invoice.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'sent' } }),
      );
      expect(result.status).toBe('sent');
    });

    it.each(['sent', 'viewed', 'partially_paid', 'overdue', 'paid', 'overpaid'])(
      're-sending a %s invoice keeps its status',
      async (status) => {
        prisma.invoice.findFirst.mockResolvedValue(invoice({ status }));

        const result = await service.send(ownerId, 'invoice-1');

        expect(prisma.invoice.update).toHaveBeenCalledWith(
          expect.objectContaining({ data: {} }),
        );
        expect(result.status).toBe(status);
        expect(events.emit).toHaveBeenCalledWith(
          InvoiceEvents.SENT,
          expect.anything(),
        );
      },
    );

    it('refuses to send a cancelled invoice', async () => {
      prisma.invoice.findFirst.mockResolvedValue(
        invoice({ status: 'cancelled' }),
      );

      await expect(service.send(ownerId, 'invoice-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.invoice.update).not.toHaveBeenCalled();
      expect(events.emit).not.toHaveBeenCalled();
    });

    it('hands the invoice and its client to the notification pipeline separately', async () => {
      prisma.invoice.findFirst.mockResolvedValue(invoice());

      const result = await service.send(ownerId, 'invoice-1');

      const [, payload] = events.emit.mock.calls[0];
      expect(payload.client).toEqual(clientRow);
      expect(payload.invoice).not.toHaveProperty('client');
      expect(result).not.toHaveProperty('client');
    });

    it('loads the lines with their billed expenses for the mail and PDF', async () => {
      prisma.invoice.findFirst.mockResolvedValue(invoice());

      await service.send(ownerId, 'invoice-1');

      expect(prisma.invoice.update.mock.calls[0][0].include).toEqual(
        expect.objectContaining({
          client: true,
          items: {
            include: {
              expense: {
                select: { vendor: true, category: true, date: true },
              },
            },
          },
        }),
      );
    });

    it("404s an invoice that isn't the caller's without emailing", async () => {
      prisma.invoice.findFirst.mockResolvedValue(null);

      await expect(service.send(ownerId, 'nope')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(events.emit).not.toHaveBeenCalled();
    });
  });

  describe('currency conversion', () => {
    const rate = {
      base: 'EUR',
      target: 'USD',
      mid: 1.0837,
      unit: 1,
      timestamp: '2026-09-23T00:00:00Z',
    };

    it('short-circuits a same-currency rate without the cache or network', async () => {
      const result = await service.conversionRate('USD', 'USD');

      expect(result).toEqual(
        expect.objectContaining({ base: 'USD', target: 'USD', mid: 1 }),
      );
      expect(cache.get).not.toHaveBeenCalled();
      expect(http.get).not.toHaveBeenCalled();
    });

    it('serves a cached rate without hitting the network', async () => {
      cache.get.mockResolvedValue(rate);

      await expect(service.conversionRate('EUR', 'USD')).resolves.toBe(rate);
      expect(cache.get).toHaveBeenCalledWith('fx_EUR_USD');
      expect(http.get).not.toHaveBeenCalled();
    });

    it('fetches and caches a rate for six hours on a miss', async () => {
      http.get.mockReturnValue(of({ data: { data: rate } }));

      await expect(service.conversionRate('EUR', 'USD')).resolves.toEqual(rate);
      expect(http.get).toHaveBeenCalledWith(
        'https://hexarate.paikama.co/api/rates/EUR/USD/latest',
      );
      expect(cache.set).toHaveBeenCalledWith(
        'fx_EUR_USD',
        rate,
        CacheTimer.SIX_HOURS,
      );
    });

    it('maps an upstream failure to a 502', async () => {
      http.get.mockReturnValue(throwError(() => new Error('ECONNRESET')));

      const err = await service.conversionRate('EUR', 'USD').catch((e) => e);

      expect(err).toBeInstanceOf(HttpException);
      expect(err.getStatus()).toBe(HttpStatus.BAD_GATEWAY);
      expect(cache.set).not.toHaveBeenCalled();
    });

    it('converts and rounds to two decimals', async () => {
      cache.get.mockResolvedValue(rate);

      await expect(service.convert('EUR', 'USD', 100)).resolves.toBe(108.37);
      await expect(
        service.convert('EUR', 'USD', new Prisma.Decimal('33.33')),
      ).resolves.toBe(36.12);
    });

    it('converts into USD via convertToDollars', async () => {
      cache.get.mockResolvedValue(rate);

      await expect(
        service.convertToDollars('EUR', new Prisma.Decimal(10)),
      ).resolves.toBe(10.84);
      expect(cache.get).toHaveBeenCalledWith('fx_EUR_USD');
    });

    it('builds every currency rate into an explicit target', async () => {
      cache.get.mockImplementation(async (key: string) => ({
        ...rate,
        mid: key === 'fx_EUR_KES' ? 140 : 2,
      }));

      const result = await service.exchangeRates(ownerId, 'KES' as any);

      expect(result.target).toBe('KES');
      expect(result.rates).toEqual({ USD: 2, EUR: 140, GBP: 2, KES: 1 });
      expect(prisma.workspace.findFirst).not.toHaveBeenCalled();
    });

    it("defaults the target to the owner's default workspace currency", async () => {
      prisma.workspace.findFirst.mockResolvedValue({ currency: 'GBP' });
      cache.get.mockResolvedValue(rate);

      const result = await service.exchangeRates(ownerId);

      expect(result.target).toBe('GBP');
      expect(prisma.workspace.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { ownerId },
          orderBy: { createdAt: 'asc' },
        }),
      );
    });

    it('falls back to USD when the owner has no workspace', async () => {
      prisma.workspace.findFirst.mockResolvedValue(null);
      cache.get.mockResolvedValue(rate);

      await expect(service.exchangeRates(ownerId)).resolves.toEqual(
        expect.objectContaining({ target: 'USD' }),
      );
    });
  });
});
