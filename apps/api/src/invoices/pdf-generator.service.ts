import { Injectable } from '@nestjs/common';
import type {
  Alignment,
  Content,
  CustomTableLayout,
  StyleDictionary,
  TableCell,
  TDocumentDefinitions,
} from 'pdfmake/interfaces';

// Plain require is deliberate: pdfmake exposes its API via non-enumerable
// accessors bound to the module object, which both destructuring and
// TypeScript's __importStar helper break.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfmake = require('pdfmake') as typeof import('pdfmake');

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

const INK = '#111827'; // primary text
const HEADER_BG = '#1f2937'; // table header fill
const MUTED = '#6b7280'; // secondary text / labels
const FAINT = '#9ca3af'; // eyebrow labels, footer
const ACCENT = '#ea580c'; // emphasis text (deep orange, readable on white)
const ACCENT_BAR = '#f97316'; // brand accent bar / rules
const ACCENT_SOFT = '#fdf0e6'; // total-row highlight
const LINE = '#e5e7eb'; // hairline rules
const ZEBRA = '#f9fafb'; // alternating row fill
const DANGER = '#dc2626'; // discounts

const CONTENT_WIDTH = 515; // A4 width minus the 40pt side margins
const TOTALS_WIDTH = 240;

@Injectable()
export class PdfGeneratorService {
  constructor() {
    pdfmake.setFonts({
      Helvetica: {
        normal: 'Helvetica',
        bold: 'Helvetica-Bold',
        italics: 'Helvetica-Oblique',
        bolditalics: 'Helvetica-BoldOblique',
      },
    });
  }

  async invoicePdf(data: InvoicePdfData): Promise<Buffer> {
    const discount = Math.max(0, data.discount || 0);
    const taxRate = data.taxRate || 0;
    const subtotal = data.items.reduce((s, it) => s + it.quantity * it.rate, 0);
    const afterDiscount = Math.max(0, subtotal - discount);
    const tax = afterDiscount * (taxRate / 100);
    const total = afterDiscount + tax;

    const money = (n: number) =>
      `${data.currency} ${n.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
    const qty = (n: number) => n.toLocaleString('en-US');

    const th = (text: string, align: Alignment = 'left'): TableCell => ({
      text,
      style: 'th',
      alignment: align,
    });
    const td = (text: string, align: Alignment = 'left'): TableCell => ({
      text,
      style: 'cell',
      alignment: align,
    });

    // Cell padding, zebra striping and the dark header all live in the layout -
    // pdfmake ignores a `padding` property set directly on cells.
    const itemsLayout: CustomTableLayout = {
      hLineWidth: (i, node) => (i === node.table.body.length ? 0.5 : 0),
      vLineWidth: () => 0,
      hLineColor: () => LINE,
      fillColor: (rowIndex) => {
        if (rowIndex === 0) return HEADER_BG;
        return rowIndex % 2 === 0 ? ZEBRA : null;
      },
      paddingLeft: () => 10,
      paddingRight: () => 10,
      paddingTop: (i) => (i === 0 ? 9 : 7),
      paddingBottom: (i) => (i === 0 ? 9 : 7),
    };

    const totalsBody: TableCell[][] = [
      [
        { text: 'Subtotal', style: 'sumLabel' },
        { text: money(subtotal), style: 'sumValue' },
      ],
    ];
    if (discount > 0) {
      totalsBody.push([
        { text: 'Discount', style: 'sumLabel' },
        { text: `-${money(discount)}`, style: 'sumValue', color: DANGER },
      ]);
    }
    totalsBody.push([
      { text: `Tax (${taxRate}%)`, style: 'sumLabel' },
      { text: money(tax), style: 'sumValue' },
    ]);
    totalsBody.push([
      { text: 'Total', style: 'sumTotalLabel' },
      { text: money(total), style: 'sumTotalValue' },
    ]);

    const totalsLayout: CustomTableLayout = {
      // A single accent rule sits above the highlighted total row.
      hLineWidth: (i, node) => (i === node.table.body.length - 1 ? 1 : 0),
      vLineWidth: () => 0,
      hLineColor: () => ACCENT_BAR,
      fillColor: (rowIndex, node) =>
        rowIndex === node.table.body.length - 1 ? ACCENT_SOFT : null,
      paddingLeft: (col) => (col === 0 ? 12 : 8),
      paddingRight: (col) => (col === 0 ? 12 : 12),
      paddingTop: (i, node) => (i === node.table.body.length - 1 ? 9 : 5),
      paddingBottom: (i, node) => (i === node.table.body.length - 1 ? 9 : 5),
    };

    const content: Content[] = [
      // Masthead: brand on the left, invoice identity on the right.
      {
        columns: [
          {
            width: '*',
            stack: [
              { text: 'FOUNDRY', style: 'brand' },
              { text: 'Studio Workspace', style: 'brandSub' },
            ],
          },
          {
            width: 'auto',
            stack: [
              { text: 'INVOICE', style: 'docType' },
              { text: data.number, style: 'docNumber' },
            ],
          },
        ],
        margin: [0, 0, 0, 16],
      },

      // Brand accent bar in place of a plain divider.
      {
        canvas: [
          {
            type: 'rect',
            x: 0,
            y: 0,
            w: CONTENT_WIDTH,
            h: 3,
            color: ACCENT_BAR,
          },
        ],
        margin: [0, 0, 0, 22],
      },

      // Bill-to and invoice metadata.
      {
        columns: [
          {
            width: '*',
            stack: [
              { text: 'BILLED TO', style: 'eyebrow' },
              { text: data.client, style: 'clientName', margin: [0, 5, 0, 0] },
            ],
          },
          {
            width: TOTALS_WIDTH,
            stack: [
              { text: 'INVOICE DETAILS', style: 'eyebrow' },
              {
                columns: [
                  { text: 'Issued', style: 'metaLabel', width: 55 },
                  { text: data.issueDate, style: 'metaValue' },
                ],
                margin: [0, 5, 0, 3],
              },
              {
                columns: [
                  { text: 'Due', style: 'metaLabel', width: 55 },
                  { text: data.dueDate, style: 'metaValue' },
                ],
              },
            ],
          },
        ],
        margin: [0, 0, 0, 26],
      },

      // Line items.
      {
        table: {
          widths: ['*', 'auto', 'auto', 'auto'],
          headerRows: 1,
          body: [
            [
              th('Description'),
              th('Qty', 'right'),
              th('Rate', 'right'),
              th('Amount', 'right'),
            ],
            ...data.items.map((it) => [
              td(it.description),
              td(qty(it.quantity), 'right'),
              td(money(it.rate), 'right'),
              td(money(it.quantity * it.rate), 'right'),
            ]),
          ],
        },
        layout: itemsLayout,
      },

      // Totals, right-aligned in a fixed-width panel.
      {
        margin: [0, 22, 0, 0],
        columns: [
          { width: '*', text: '' },
          {
            width: TOTALS_WIDTH,
            table: { widths: ['*', 'auto'], body: totalsBody },
            layout: totalsLayout,
          },
        ],
      },
    ];

    if (data.notes) {
      content.push({
        margin: [0, 32, 0, 0],
        stack: [
          { text: 'NOTES', style: 'eyebrow' },
          { text: data.notes, style: 'notes', margin: [0, 5, 0, 0] },
        ],
      });
    }

    content.push({
      text: 'Thank you for your business.',
      style: 'thanks',
      margin: [0, 36, 0, 0],
    });

    const styles: StyleDictionary = {
      brand: { fontSize: 26, bold: true, color: INK, characterSpacing: 2 },
      brandSub: { fontSize: 10, color: MUTED, characterSpacing: 1 },
      docType: {
        fontSize: 13,
        bold: true,
        color: MUTED,
        alignment: 'right',
        characterSpacing: 3,
      },
      docNumber: {
        fontSize: 22,
        bold: true,
        color: ACCENT,
        alignment: 'right',
        margin: [0, 3, 0, 0],
      },
      eyebrow: { fontSize: 8, bold: true, color: FAINT, characterSpacing: 1.5 },
      clientName: { fontSize: 14, bold: true, color: INK },
      metaLabel: { fontSize: 10, color: MUTED },
      metaValue: { fontSize: 10, bold: true, color: INK },
      th: { fontSize: 9, bold: true, color: '#ffffff', characterSpacing: 0.5 },
      cell: { fontSize: 10, color: INK },
      sumLabel: { fontSize: 10, color: MUTED },
      sumValue: { fontSize: 10, color: INK, alignment: 'right' },
      sumTotalLabel: { fontSize: 12, bold: true, color: INK },
      sumTotalValue: {
        fontSize: 12,
        bold: true,
        color: ACCENT,
        alignment: 'right',
      },
      notes: { fontSize: 10, color: MUTED, lineHeight: 1.3 },
      thanks: {
        fontSize: 10,
        color: FAINT,
        alignment: 'center',
        characterSpacing: 0.5,
      },
    };

    const definition: TDocumentDefinitions = {
      defaultStyle: { font: 'Helvetica', fontSize: 10, color: INK },
      pageMargins: [40, 56, 40, 64],
      content,
      styles,
      footer: (currentPage, pageCount) => ({
        margin: [40, 0, 40, 32],
        columns: [
          {
            text: 'FOUNDRY',
            fontSize: 8,
            bold: true,
            color: FAINT,
            characterSpacing: 1,
          },
          {
            text: `Page ${currentPage} of ${pageCount}`,
            fontSize: 8,
            color: FAINT,
            alignment: 'right',
          },
        ],
      }),
    };

    return pdfmake.createPdf(definition).getBuffer();
  }
}
