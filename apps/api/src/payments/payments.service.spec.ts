import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PaymentEvents } from '../common/events';
import { PaymentsService } from './payments.service';

describe('PaymentsService - client/invoice consistency', () => {
  let service: PaymentsService;
  let prisma: {
    payment: { create: jest.Mock; findFirst: jest.Mock; update: jest.Mock };
  };
  let clients: { findOne: jest.Mock };
  let invoices: { findOne: jest.Mock };
  let reconciliation: { applyPayment: jest.Mock; adjustPayment: jest.Mock };
  let events: { emit: jest.Mock };

  const ownerId = 'owner-1';
  const invoiceFor = (clientId: string) => ({ id: 'invoice-1', clientId });
  const dto = {
    clientId: 'client-a',
    invoiceId: 'invoice-1',
    amount: 100,
    date: '2026-09-01T00:00:00.000Z',
  } as any;

  beforeEach(() => {
    prisma = {
      payment: {
        create: jest.fn(async ({ data }) => ({ id: 'payment-1', ...data })),
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'payment-1', clientId: 'client-a' }),
        update: jest.fn(async ({ data }) => ({
          id: 'payment-1',
          clientId: 'client-a',
          ...data,
        })),
      },
    };
    clients = { findOne: jest.fn().mockResolvedValue({ id: 'client-a' }) };
    invoices = { findOne: jest.fn().mockResolvedValue(invoiceFor('client-a')) };
    reconciliation = { applyPayment: jest.fn(), adjustPayment: jest.fn() };
    events = { emit: jest.fn() };
    service = new PaymentsService(
      prisma as any,
      undefined as any,
      clients as any,
      invoices as any,
      reconciliation as any,
      events as any,
    );
  });

  it("records a payment against the client's own invoice", async () => {
    await service.create(ownerId, dto);

    expect(invoices.findOne).toHaveBeenCalledWith(ownerId, 'invoice-1');
    expect(reconciliation.applyPayment).toHaveBeenCalled();
    expect(events.emit).toHaveBeenCalledWith(
      PaymentEvents.RECEIVED,
      expect.objectContaining({ id: 'payment-1' }),
    );
  });

  it("rejects a payment against another client's invoice without recording it", async () => {
    invoices.findOne.mockResolvedValue(invoiceFor('client-b'));

    await expect(service.create(ownerId, dto)).rejects.toThrow(
      "The invoice is billed to a different client than the payment's",
    );
    expect(prisma.payment.create).not.toHaveBeenCalled();
    expect(reconciliation.applyPayment).not.toHaveBeenCalled();
  });

  it("404s an invoice that isn't the caller's", async () => {
    invoices.findOne.mockRejectedValue(new NotFoundException());

    await expect(service.create(ownerId, dto)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.payment.create).not.toHaveBeenCalled();
  });

  it('allows a payment with no invoice', async () => {
    await service.create(ownerId, { ...dto, invoiceId: undefined });

    expect(invoices.findOne).not.toHaveBeenCalled();
    expect(prisma.payment.create).toHaveBeenCalled();
  });

  it("rejects moving a payment onto another client's invoice", async () => {
    invoices.findOne.mockResolvedValue(invoiceFor('client-b'));

    await expect(
      service.update(ownerId, 'payment-1', { invoiceId: 'invoice-1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.payment.update).not.toHaveBeenCalled();
    expect(reconciliation.adjustPayment).not.toHaveBeenCalled();
  });

  it("moves a payment onto another of its own client's invoices", async () => {
    await service.update(ownerId, 'payment-1', { invoiceId: 'invoice-1' });

    expect(prisma.payment.update).toHaveBeenCalled();
    expect(reconciliation.adjustPayment).toHaveBeenCalled();
  });
});
