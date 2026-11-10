import type { Mock } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { PortalInvoicesService } from '../invoices/portal-invoices.service';
import { PortalInvoicesQueryDto } from '../invoices/portal-invoices-query.dto';
import { PortalPaymentsService } from '../payments/portal-payments.service';
import { PortalPaymentsQueryDto } from '../payments/portal-payments-query.dto';

/** The status/method/project filters of the portal's invoice and payment lists. */
describe('portal billing list filters', () => {
  let pagination: { paginate: Mock };
  let context: { require: Mock };
  let billing: Record<string, Mock>;

  beforeEach(() => {
    pagination = {
      paginate: vi.fn(async () => ({ count: 0, next: null, previous: null, results: [] })),
    };
    context = { require: vi.fn().mockResolvedValue({ clientId: 'c-1' }) };
    billing = {
      assertVisible: vi.fn().mockResolvedValue(undefined),
      visibleProjects: vi.fn().mockResolvedValue(new Map()),
      paidByInvoice: vi.fn().mockResolvedValue(new Map()),
      total: vi.fn().mockReturnValue(0),
    };
  });

  const where = () => pagination.paginate.mock.calls[0][1].where;

  describe('invoices', () => {
    const service = () =>
      new PortalInvoicesService({} as never, pagination as never, context as never, {} as never, billing as never);

    it('hides drafts when unfiltered', async () => {
      await service().findAll('portal-1', 'pu-1', {}, '/x');
      expect(where()).toEqual({ clientId: 'c-1', status: { not: 'draft' } });
    });

    it('filters by status and a shared project', async () => {
      await service().findAll('portal-1', 'pu-1', { status: 'overdue', projectId: 'p-1' }, '/x');
      expect(billing.assertVisible).toHaveBeenCalledWith('portal-1', 'pu-1', 'p-1');
      expect(where()).toEqual({ clientId: 'c-1', status: 'overdue', projectId: 'p-1' });
    });

    it('refuses a project the user cannot see', async () => {
      billing.assertVisible.mockRejectedValue(new NotFoundException());
      await expect(
        service().findAll('portal-1', 'pu-1', { projectId: 'p-9' }, '/x'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(pagination.paginate).not.toHaveBeenCalled();
    });

    it('never accepts draft as a status filter', async () => {
      const errors = await validate(plainToInstance(PortalInvoicesQueryDto, { status: 'draft' }));
      expect(errors.map((e) => e.property)).toEqual(['status']);
    });
  });

  describe('payments', () => {
    const service = () =>
      new PortalPaymentsService({} as never, pagination as never, context as never, billing as never);

    it('filters by method and by the project of the invoice paid', async () => {
      await service().findAll('portal-1', 'pu-1', { method: 'mobile_money', projectId: 'p-1' }, '/x');
      expect(where()).toEqual({
        clientId: 'c-1',
        invoice: { projectId: 'p-1' },
        method: 'mobile_money',
      });
    });

    it('rejects an unknown method', async () => {
      const errors = await validate(plainToInstance(PortalPaymentsQueryDto, { method: 'cheque' }));
      expect(errors.map((e) => e.property)).toEqual(['method']);
    });
  });
});
