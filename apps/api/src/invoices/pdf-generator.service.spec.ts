import { PdfGeneratorService, type PdfTheme } from './pdf-generator.service';

const party = { name: 'Acme Ltd', email: 'billing@acme.test' };
const invoice = {
  number: 'INV-1001',
  biller: party,
  billedTo: { name: 'Client Co' },
  issueDate: '2026-10-01',
  dueDate: '2026-10-15',
  currency: 'USD',
  items: [
    { description: 'Design', quantity: 2, rate: 500 },
    {
      description: 'Hosting',
      quantity: 1,
      rate: 40,
      expense: { date: '2026-09-30' },
    },
  ],
  taxRate: 16,
  discount: 50,
  notes: 'Net 14',
};

const isPdf = (buffer: Buffer) => buffer.subarray(0, 5).toString() === '%PDF-';

describe('PdfGeneratorService themes', () => {
  const pdf = new PdfGeneratorService();

  it('renders the default design without a theme', async () => {
    expect(isPdf(await pdf.invoicePdf(invoice))).toBe(true);
  });

  it.each<[string, PdfTheme]>([
    [
      'solid header, Times, Letter',
      {
        accent: '#1e40af',
        headerStyle: 'solid',
        font: 'Times',
        pageSize: 'LETTER',
      },
    ],
    [
      'underline header, compact, striped',
      {
        accent: '#0f766e',
        headerStyle: 'underline',
        density: 'compact',
        striped: true,
      },
    ],
    [
      'minimal header, Courier, Legal, wide margins',
      {
        headerStyle: 'minimal',
        font: 'Courier',
        pageSize: 'LEGAL',
        margins: { x: 72, y: 72 },
      },
    ],
    [
      'everything hidden',
      {
        showLogo: false,
        showNotes: false,
        showPageNumbers: false,
        accentBar: false,
        thankYou: '',
      },
    ],
    [
      'extra blocks',
      {
        terms: 'Late fees apply.',
        paymentInstructions: 'IBAN GB00 0000',
        footerText: 'Acme Ltd - VAT 123',
      },
    ],
  ])('renders an invoice, quote and receipt with %s', async (_label, theme) => {
    const brand = { name: 'Acme', theme };
    expect(isPdf(await pdf.invoicePdf({ ...invoice, brand }))).toBe(true);
    expect(
      isPdf(
        await pdf.quotePdf({
          ...invoice,
          validUntil: '2026-11-01',
          brand,
        }),
      ),
    ).toBe(true);
    expect(
      isPdf(
        await pdf.receiptPdf({
          receiptNumber: 'RCT-1',
          invoiceNumber: invoice.number,
          biller: party,
          billedTo: invoice.billedTo,
          paymentDate: '2026-10-05',
          paymentMethod: 'Bank transfer',
          currency: 'USD',
          paymentAmount: 100,
          invoiceTotal: 1150,
          amountPaidToDate: 100,
          balanceDue: 1050,
          brand,
        }),
      ),
    ).toBe(true);
  });

  it('falls back to the defaults for colours that are not hex', async () => {
    const theme = { accent: 'red; drop table', ink: 'url(x)' } as PdfTheme;
    expect(isPdf(await pdf.invoicePdf({ ...invoice, brand: { theme } }))).toBe(
      true,
    );
  });
});
