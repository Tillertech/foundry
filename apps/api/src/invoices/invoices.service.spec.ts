import { ConflictException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { InvoicesService } from './invoices.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';

function duplicateNumberError() {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { target: ['number'] },
  });
}

describe('InvoicesService', () => {
  let service: InvoicesService;
  let prisma: {
    invoice: {
      create: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
    };
    workspace: { findUnique: jest.Mock };
  };
  let clients: { findOne: jest.Mock };
  let projects: { findOne: jest.Mock };

  const ownerId = 'owner-1';
  const client = { id: 'client-1', workspaceId: 'ws-1' };
  const baseDto: CreateInvoiceDto = {
    clientId: client.id,
    issueDate: '2026-01-01',
    dueDate: '2026-01-15',
    items: [{ description: 'Work', quantity: 1, rate: 100 }],
  };

  beforeEach(() => {
    prisma = {
      invoice: {
        create: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      workspace: { findUnique: jest.fn() },
    };
    clients = { findOne: jest.fn().mockResolvedValue(client) };
    projects = { findOne: jest.fn() };

    service = new InvoicesService(
      prisma as any,
      undefined as any, // PaginationService - unused by create()
      clients as any,
      projects as any,
      { emit: jest.fn() } as any, // EventEmitter2
      undefined as any, // CACHE_MANAGER
      undefined as any, // HttpService
    );
  });

  describe('numbering', () => {
    it('starts a fresh workspace sequence at 1001 with the default prefix', async () => {
      prisma.workspace.findUnique.mockResolvedValue({ invoicePrefix: null });
      prisma.invoice.create.mockImplementation(async ({ data }) => ({
        ...data,
      }));

      const result = await service.create(ownerId, baseDto);

      expect(result.number).toBe('INV-1001');
    });

    it('applies the workspace invoicePrefix when set', async () => {
      prisma.workspace.findUnique.mockResolvedValue({ invoicePrefix: 'ACME-' });
      prisma.invoice.create.mockImplementation(async ({ data }) => ({
        ...data,
      }));

      const result = await service.create(ownerId, baseDto);

      expect(result.number).toBe('ACME-1001');
    });

    it("scopes the lookup to the invoice owner's workspace, not every workspace", async () => {
      prisma.workspace.findUnique.mockResolvedValue({ invoicePrefix: null });
      prisma.invoice.create.mockImplementation(async ({ data }) => ({
        ...data,
      }));

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
      prisma.workspace.findUnique.mockResolvedValue({ invoicePrefix: null });
      prisma.invoice.findMany.mockResolvedValue([
        { number: 'INV-1000' },
        { number: 'INV-999' },
        { number: 'INV-9999' },
        { number: 'INV-2000' },
      ]);
      prisma.invoice.create.mockImplementation(async ({ data }) => ({
        ...data,
      }));

      const result = await service.create(ownerId, baseDto);

      expect(result.number).toBe('INV-10000');
    });

    it('ignores a manually-set, non-numeric suffix sharing the prefix', async () => {
      prisma.workspace.findUnique.mockResolvedValue({ invoicePrefix: null });
      prisma.invoice.findMany.mockResolvedValue([
        { number: 'INV-1002' },
        { number: 'INV-CUSTOM' },
      ]);
      prisma.invoice.create.mockImplementation(async ({ data }) => ({
        ...data,
      }));

      const result = await service.create(ownerId, baseDto);

      expect(result.number).toBe('INV-1003');
    });

    it('does not look up a number when the caller supplies one', async () => {
      prisma.invoice.create.mockImplementation(async ({ data }) => ({
        ...data,
      }));

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
      prisma.workspace.findUnique.mockResolvedValue({ invoicePrefix: null });
      prisma.invoice.findMany
        .mockResolvedValueOnce([]) // attempt 1 -> INV-1001
        .mockResolvedValueOnce([{ number: 'INV-1001' }]); // attempt 2 -> INV-1002
      prisma.invoice.create
        .mockRejectedValueOnce(duplicateNumberError())
        .mockImplementationOnce(async ({ data }) => ({ ...data }));

      const result = await service.create(ownerId, baseDto);

      expect(result.number).toBe('INV-1002');
      expect(prisma.invoice.create).toHaveBeenCalledTimes(2);
    });

    it('gives up after repeated collisions with a 409, not a raw 500', async () => {
      prisma.workspace.findUnique.mockResolvedValue({ invoicePrefix: null });
      prisma.invoice.create.mockRejectedValue(duplicateNumberError());

      await expect(service.create(ownerId, baseDto)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('converts a duplicate caller-supplied number into a 409', async () => {
      prisma.invoice.create.mockRejectedValue(duplicateNumberError());

      await expect(
        service.create(ownerId, { ...baseDto, number: 'INV-1001' }),
      ).rejects.toBeInstanceOf(ConflictException);
      // Explicit numbers are trusted as-is - no retry loop burning extra numbers.
      expect(prisma.invoice.create).toHaveBeenCalledTimes(1);
    });

    it('does not swallow unrelated database errors', async () => {
      prisma.workspace.findUnique.mockResolvedValue({ invoicePrefix: null });
      const boom = new Error('connection reset');
      prisma.invoice.create.mockRejectedValue(boom);

      await expect(service.create(ownerId, baseDto)).rejects.toBe(boom);
    });

    it('converts a duplicate number from an edit into a 409, not a raw 500', async () => {
      prisma.invoice.findFirst.mockResolvedValue({
        id: 'invoice-1',
        items: [],
        project: null,
      });
      prisma.invoice.update.mockRejectedValue(duplicateNumberError());

      await expect(
        service.update(ownerId, 'invoice-1', { number: 'INV-1001' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  it('validates the client and project belong to the caller before creating', async () => {
    prisma.workspace.findUnique.mockResolvedValue({ invoicePrefix: null });
    prisma.invoice.create.mockImplementation(async ({ data }) => ({
      ...data,
    }));
    projects.findOne.mockResolvedValue({ id: 'project-1' });

    await service.create(ownerId, { ...baseDto, projectId: 'project-1' });

    expect(clients.findOne).toHaveBeenCalledWith(ownerId, client.id);
    expect(projects.findOne).toHaveBeenCalledWith(ownerId, 'project-1');
  });
});
