import { Injectable } from '@nestjs/common';
import PdfPrinter from 'pdfmake';
import type { TDocumentDefinitions } from 'pdfmake/interfaces';

export interface InvoicePdfData {
  number: string;
  client: string;
  issueDate: string;
  dueDate: string;
  currency: string;
  items: { description: string; quantity: number; rate: number }[];
  taxRate: number;
  discount: number;
  notes?: string;
}

/** Generates PDFs with pdfmake using the built-in standard (Helvetica) fonts. */
@Injectable()
export class PdfService {
  private readonly printer = new PdfPrinter({
    Helvetica: {
      normal: 'Helvetica',
      bold: 'Helvetica-Bold',
      italics: 'Helvetica-Oblique',
      bolditalics: 'Helvetica-BoldOblique',
    },
  });

  async invoicePdf(data: InvoicePdfData): Promise<Buffer> {
    const subtotal = data.items.reduce((s, it) => s + it.quantity * it.rate, 0);
    const afterDiscount = Math.max(0, subtotal - (data.discount || 0));
    const tax = afterDiscount * ((data.taxRate || 0) / 100);
    const total = afterDiscount + tax;
    const fmt = (n: number) => `${data.currency} ${n.toFixed(2)}`;

    const definition: TDocumentDefinitions = {
      defaultStyle: { font: 'Helvetica', fontSize: 10 },
      content: [
        { text: 'Ledger', fontSize: 20, bold: true, margin: [0, 0, 0, 2] },
        { text: 'Studio workspace', color: '#666666', margin: [0, 0, 0, 16] },
        { text: `Invoice ${data.number}`, fontSize: 14, bold: true },
        {
          text: `Billed to ${data.client} · Issued ${data.issueDate} · Due ${data.dueDate}`,
          color: '#666666',
          margin: [0, 4, 0, 16],
        },
        {
          table: {
            widths: ['*', 'auto', 'auto', 'auto'],
            headerRows: 1,
            body: [
              [
                { text: 'Description', bold: true },
                { text: 'Qty', bold: true, alignment: 'right' },
                { text: 'Rate', bold: true, alignment: 'right' },
                { text: 'Amount', bold: true, alignment: 'right' },
              ],
              ...data.items.map((it) => [
                it.description,
                { text: String(it.quantity), alignment: 'right' },
                { text: fmt(it.rate), alignment: 'right' },
                { text: fmt(it.quantity * it.rate), alignment: 'right' },
              ]),
            ],
          },
          layout: 'lightHorizontalLines',
        },
        {
          margin: [0, 16, 0, 0],
          columns: [
            { width: '*', text: '' },
            {
              width: 'auto',
              table: {
                body: [
                  ['Subtotal', { text: fmt(subtotal), alignment: 'right' }],
                  ...(data.discount > 0
                    ? [['Discount', { text: `-${fmt(data.discount)}`, alignment: 'right' as const }]]
                    : []),
                  [`Tax (${data.taxRate}%)`, { text: fmt(tax), alignment: 'right' }],
                  [
                    { text: 'Total', bold: true },
                    { text: fmt(total), bold: true, alignment: 'right' },
                  ],
                ],
              },
              layout: 'noBorders',
            },
          ],
        },
        ...(data.notes
          ? [{ text: data.notes, color: '#666666', margin: [0, 24, 0, 0] as [number, number, number, number] }]
          : []),
      ],
    };

    return new Promise<Buffer>((resolve, reject) => {
      const doc = this.printer.createPdfKitDocument(definition);
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      doc.end();
    });
  }
}
