import { HttpErrorResponse } from '@angular/common/http';
import { emptyQuoteLine, QuoteLineDraft } from './quote-lines-editor';
import {
  QuoteDraft,
  issuesFromApi,
  lineKey,
  quoteWarnings,
  validateQuote,
} from './quote-validation';

const line = (over: Partial<QuoteLineDraft> = {}): QuoteLineDraft => ({
  ...emptyQuoteLine('milestone'),
  id: 'l1',
  description: 'Discovery',
  rate: 500,
  ...over,
});

const draft = (over: Partial<QuoteDraft> = {}): QuoteDraft => ({
  clientId: 'c1',
  number: '',
  issueDate: '2026-11-10',
  validUntil: '2026-12-10',
  taxRate: 16,
  retentionPercent: 0,
  items: [line()],
  ...over,
});

const keys = (q: QuoteDraft, opts = { pickClient: true }) =>
  validateQuote(q, opts).map((i) => i.key);

describe('validateQuote', () => {
  it('passes a complete quote', () => {
    expect(validateQuote(draft(), { pickClient: true })).toEqual([]);
  });

  it('asks for a client only while one can still be picked', () => {
    expect(keys(draft({ clientId: '' }))).toEqual(['client']);
    expect(keys(draft({ clientId: '' }), { pickClient: false })).toEqual([]);
  });

  it('needs both dates, with the expiry on or after the issue date', () => {
    expect(keys(draft({ issueDate: '' }))).toEqual(['issueDate']);
    const [issue] = validateQuote(draft({ validUntil: '2026-11-01' }), {
      pickClient: true,
    });
    expect(issue.key).toBe('validUntil');
    expect(issue.message).toMatch(/on or after the issue date/);
  });

  it('only blocks an expired quote when sending it', () => {
    const q = draft({ issueDate: '2026-01-01', validUntil: '2026-02-01' });
    expect(keys(q)).toEqual([]);
    expect(
      validateQuote(q, {
        pickClient: true,
        sending: true,
        today: '2026-11-11',
      }),
    ).toEqual([
      expect.objectContaining({
        key: 'validUntil',
        message: expect.stringMatching(/has passed/),
      }),
    ]);
  });

  it('keeps tax and retention between 0 and 100', () => {
    expect(keys(draft({ taxRate: -1 }))).toEqual(['taxRate']);
    expect(keys(draft({ retentionPercent: 101 }))).toEqual([
      'retentionPercent',
    ]);
    expect(keys(draft({ taxRate: null }))).toEqual(['taxRate']);
  });

  it('needs at least one line', () => {
    expect(keys(draft({ items: [] }))).toEqual(['items']);
  });

  it('names an unnamed line by its kind', () => {
    const [milestone] = validateQuote(
      draft({ items: [line({ description: '  ' })] }),
      {
        pickClient: true,
      },
    );
    expect(milestone).toEqual({
      key: lineKey('l1', 'description'),
      message: expect.stringMatching(/Name this milestone/),
    });
    const [option] = validateQuote(
      draft({ items: [line({ kind: 'option', description: '' })] }),
      { pickClient: true },
    );
    expect(option.message).toMatch(/Name this option/);
  });

  it('refuses negative quantities and rates', () => {
    expect(keys(draft({ items: [line({ quantity: -1, rate: -5 })] }))).toEqual([
      lineKey('l1', 'quantity'),
      lineKey('l1', 'rate'),
    ]);
  });

  it('enforces the API limits on scope text', () => {
    expect(
      keys(
        draft({
          items: [
            line({
              acceptanceCriteria: 'x'.repeat(5001),
              deliverables: [{ id: 'd', label: 'y'.repeat(501) }],
            }),
          ],
        }),
      ),
    ).toEqual([
      lineKey('l1', 'acceptanceCriteria'),
      lineKey('l1', 'deliverables'),
    ]);
  });
});

describe('quoteWarnings', () => {
  it('warns when the quote and client currencies differ', () => {
    const w = quoteWarnings(
      { ...draft(), currency: 'USD' },
      { name: 'Acme', currency: 'KES' },
    );
    expect(w['currency']).toMatch(/Acme is billed in KES/);
    expect(
      quoteWarnings(
        { ...draft(), currency: 'KES' },
        { name: 'Acme', currency: 'KES' },
      ),
    ).toEqual({});
  });

  it('flags a named milestone with no price', () => {
    const w = quoteWarnings(
      { ...draft({ items: [line({ rate: 0 })] }), currency: 'USD' },
      null,
    );
    expect(w[lineKey('l1', 'rate')]).toMatch(/No price yet/);
  });
});

describe('issuesFromApi', () => {
  const items = [line({ id: 'a' }), line({ id: 'b' })];
  const res = (status: number, message: string | string[]) =>
    new HttpErrorResponse({ status, error: { statusCode: status, message } });

  it('files validation messages under the line they name', () => {
    const { issues, unplaced } = issuesFromApi(
      res(400, [
        'items.1.rate must not be less than 0',
        'taxRate must not be less than 0',
        'something odd',
      ]),
      items,
    );
    expect(issues).toEqual([
      { key: lineKey('b', 'rate'), message: 'Must not be less than 0' },
      { key: 'taxRate', message: 'Must not be less than 0' },
    ]);
    expect(unplaced).toEqual(['something odd']);
  });

  it('puts a taken quote number on the number field', () => {
    const { issues } = issuesFromApi(
      res(409, 'Quote number Q-1 is already in use - ...'),
      items,
    );
    expect(issues).toEqual([expect.objectContaining({ key: 'number' })]);
  });

  it('ignores anything that is not an HTTP error', () => {
    expect(issuesFromApi(new Error('boom'), items)).toEqual({
      issues: [],
      unplaced: [],
    });
  });
});
