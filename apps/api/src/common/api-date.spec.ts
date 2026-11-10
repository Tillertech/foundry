import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateQuoteDto } from '../quotes/dto/create-quote.dto';
import { UpdateInvoiceDto } from '../invoices/dto/update-invoice.dto';
import { toApiTimestamp } from './api-date';

describe('IsApiDate', () => {
  it('turns a plain date into midnight UTC and keeps full timestamps', () => {
    expect(toApiTimestamp('2026-11-10')).toBe('2026-11-10T00:00:00.000Z');
    expect(toApiTimestamp(' 2026-11-10 ')).toBe('2026-11-10T00:00:00.000Z');
    expect(toApiTimestamp('2026-11-10T09:30:00.000Z')).toBe('2026-11-10T09:30:00.000Z');
    expect(toApiTimestamp('2026-11-10T12:00:00+03:00')).toBe('2026-11-10T09:00:00.000Z');
  });

  it('leaves anything that is not a date for validation to reject', () => {
    expect(toApiTimestamp('next tuesday')).toBe('next tuesday');
    expect(toApiTimestamp(undefined)).toBeUndefined();
  });

  it('normalises request bodies, including inherited update DTOs', async () => {
    const quote = plainToInstance(CreateQuoteDto, {
      clientId: '2b0832a9-8fde-4900-9ca1-695ec4ac1f37',
      issueDate: '2026-11-10',
      validUntil: '2026-12-10',
      items: [{ description: 'x', quantity: 1, rate: 1 }],
    });
    expect(quote.issueDate).toBe('2026-11-10T00:00:00.000Z');
    expect(await validate(quote)).toEqual([]);

    const invoice = plainToInstance(UpdateInvoiceDto, { dueDate: '2026-11-24' });
    expect(invoice.dueDate).toBe('2026-11-24T00:00:00.000Z');

    const bad = plainToInstance(UpdateInvoiceDto, { dueDate: '2026-13-45' });
    expect((await validate(bad)).map((e) => e.property)).toEqual(['dueDate']);
  });
});
