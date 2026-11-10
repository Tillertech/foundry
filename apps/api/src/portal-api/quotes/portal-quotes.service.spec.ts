import type { Mock } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PortalQuotesService } from './portal-quotes.service';

describe('PortalQuotesService', () => {
  let service: PortalQuotesService;
  let prisma: any;
  let tx: any;
  let events: { emit: Mock };
  let context: { require: Mock };

  const now = new Date('2026-11-10T12:00:00Z');
  const quote = (overrides: Record<string, unknown> = {}) => ({
    id: 'q-1',
    number: 'Q-2001',
    status: 'sent',
    clientId: 'c-1',
    projectId: null,
    validUntil: new Date('2026-11-10T00:00:00Z'),
    items: [
      { id: 'm-line', kind: 'milestone', selected: false },
      { id: 'opt-a', kind: 'option', selected: true },
      { id: 'opt-b', kind: 'option', selected: false },
    ],
    ...overrides,
  });

  beforeEach(() => {
    vi.useFakeTimers().setSystemTime(now);
    tx = {
      quoteItem: { update: vi.fn() },
      quote: { update: vi.fn(async ({ data }) => ({ ...quote(), ...data })) },
    };
    prisma = {
      quote: {
        findFirst: vi.fn().mockResolvedValue(quote()),
        update: vi.fn(async ({ data }) => ({ ...quote(), ...data })),
        findUnique: vi.fn(async () => ({ ...quote({ status: 'accepted' }), client: { id: 'c-1' } })),
      },
      clientPortalUser: {
        findUnique: vi.fn().mockResolvedValue({ name: 'Ada', email: 'ada@griid.test' }),
      },
      $transaction: vi.fn(async (fn: (t: unknown) => unknown) => fn(tx)),
    };
    events = { emit: vi.fn() };
    context = { require: vi.fn().mockResolvedValue({ clientId: 'c-1' }) };
    service = new PortalQuotesService(prisma, {} as any, context as any, events as any);
  });

  afterEach(() => vi.useRealTimers());

  it('never shows drafts', async () => {
    await service.findOne('portal-1', 'q-1');
    expect(prisma.quote.findFirst.mock.calls[0][0].where).toEqual({
      id: 'q-1',
      clientId: 'c-1',
      status: { not: 'draft' },
    });
  });

  describe('accept', () => {
    it('accepts with the picked options and records who answered', async () => {
      const result = await service.accept('portal-1', 'pu-1', 'q-1', { optionIds: ['opt-b'] });

      expect(context.require).toHaveBeenCalledWith('portal-1', 'viewQuotes');
      expect(tx.quoteItem.update.mock.calls.map(([a]: any) => [a.where.id, a.data.selected])).toEqual([
        ['opt-a', false],
        ['opt-b', true],
      ]);
      expect(tx.quote.update.mock.calls[0][0].data).toMatchObject({
        status: 'accepted',
        respondedAt: now,
        respondedBy: 'Ada <ada@griid.test>',
      });
      expect(result.status).toBe('accepted');
      expect(events.emit).toHaveBeenCalledWith(
        'quote.responded',
        expect.objectContaining({ accepted: true, respondedBy: 'Ada <ada@griid.test>' }),
      );
      expect(events.emit).toHaveBeenCalledWith(
        'quote.changed',
        expect.objectContaining({ quoteId: 'q-1', status: 'accepted', previousStatus: 'sent' }),
      );
    });

    it('keeps the options as quoted when none are passed', async () => {
      await service.accept('portal-1', 'pu-1', 'q-1', {});
      expect(tx.quoteItem.update).not.toHaveBeenCalled();
    });

    it('rejects an option id that is not on the quote', async () => {
      await expect(
        service.accept('portal-1', 'pu-1', 'q-1', { optionIds: ['m-line'] }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it.each([
      ['accepted', {}],
      ['declined', {}],
      ['converted', { projectId: 'p-1' }],
    ])('refuses a quote that is already %s', async (status, extra) => {
      prisma.quote.findFirst.mockResolvedValue(
        quote({ status: status === 'converted' ? 'sent' : status, ...extra }),
      );
      await expect(service.accept('portal-1', 'pu-1', 'q-1', {})).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('stays answerable through the last valid day, not after it', async () => {
      await expect(service.accept('portal-1', 'pu-1', 'q-1', {})).resolves.toBeTruthy();
      prisma.quote.findFirst.mockResolvedValue(quote({ validUntil: new Date('2026-11-09T00:00:00Z') }));
      await expect(service.accept('portal-1', 'pu-1', 'q-1', {})).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it("404s a quote that isn't this client's (or is a draft)", async () => {
      prisma.quote.findFirst.mockResolvedValue(null);
      await expect(service.accept('portal-1', 'pu-1', 'q-9', {})).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  it('declines with a trimmed reason', async () => {
    await service.decline('portal-1', 'pu-1', 'q-1', { reason: '  Budget moved  ' });
    expect(prisma.quote.update.mock.calls[0][0].data).toMatchObject({
      status: 'declined',
      responseNote: 'Budget moved',
      respondedBy: 'Ada <ada@griid.test>',
    });
    expect(events.emit).toHaveBeenCalledWith(
      'quote.responded',
      expect.objectContaining({ accepted: false, note: 'Budget moved' }),
    );
  });
});
