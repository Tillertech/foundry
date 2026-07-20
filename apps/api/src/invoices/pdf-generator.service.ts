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

/** logo replaces the brand wordmark. */
export interface PdfBrand {
  name?: string;
  subName?: string;
  /** PNG/JPEG data URL - pdfmake renders no other image formats. */
  logoDataUrl?: string;
}

/**
 * A billing party (the workspace issuing the document, or the client being
 * billed).
 */
export interface PdfParty {
  name: string;
  /** Company / trading name (client) or registered legal name (biller). */
  detail?: string | null;
  address?: string | null;
  city?: string | null;
  postCode?: string | null;
  country?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  /** Label for the tax identifier line, e.g. "Tax ID" or "VAT No.". */
  taxLabel?: string;
  taxId?: string | null;
}

export interface InvoicePdfData {
  number: string;
  biller: PdfParty;
  billedTo: PdfParty;
  issueDate: string;
  dueDate: string;
  currency: string;
  items: { description: string; quantity: number; rate: number }[];
  taxRate: number;
  discount: number;
  notes?: string;
  brand?: PdfBrand;
}

export interface QuotePdfData {
  number: string;
  biller: PdfParty;
  billedTo: PdfParty;
  issueDate: string;
  validUntil: string;
  currency: string;
  items: { description: string; quantity: number; rate: number }[];
  taxRate: number;
  notes?: string;
  brand?: PdfBrand;
}

/** Shared invoice/quote layout: only the document label and dates differ. */
interface DocumentPdfData {
  docType: 'INVOICE' | 'QUOTE';
  number: string;
  biller: PdfParty;
  billedTo: PdfParty;
  dates: { label: string; value: string }[];
  currency: string;
  items: { description: string; quantity: number; rate: number }[];
  taxRate: number;
  discount: number;
  notes?: string;
  brand?: PdfBrand;
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
const TOTALS_WIDTH = 220;

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

  invoicePdf(data: InvoicePdfData): Promise<Buffer> {
    const { issueDate, dueDate, ...rest } = data;
    return this.documentPdf({
      ...rest,
      docType: 'INVOICE',
      dates: [
        { label: 'Issued', value: issueDate },
        { label: 'Due', value: dueDate },
      ],
    });
  }

  quotePdf(data: QuotePdfData): Promise<Buffer> {
    const { issueDate, validUntil, ...rest } = data;
    return this.documentPdf({
      ...rest,
      docType: 'QUOTE',
      discount: 0,
      dates: [
        { label: 'Issued', value: issueDate },
        { label: 'Valid until', value: validUntil },
      ],
    });
  }

  private async documentPdf(data: DocumentPdfData): Promise<Buffer> {
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
      { text: `VAT (${taxRate}%)`, style: 'sumLabel' },
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

    const brandName = data.brand?.name?.trim() || 'FOUNDRY';
    const brandSub = data.brand?.subName?.trim() || 'Studio Workspace';
    const brandStack: Content[] = data.brand?.logoDataUrl
      ? [
          { image: data.brand.logoDataUrl, fit: [150, 48] },
          { text: brandName, style: 'brandSub', margin: [0, 6, 0, 0] },
        ]
      : [
          { text: brandName.toUpperCase(), style: 'brand' },
          { text: brandSub, style: 'brandSub' },
        ];

    const dateRows: Content[] = data.dates.map((date, index) => ({
      columns: [
        { text: date.label, style: 'metaLabel', alignment: 'right' as Alignment },
        {
          text: date.value,
          style: 'metaValue',
          alignment: 'right' as Alignment,
          width: 96,
        },
      ],
      margin: [0, index === 0 ? 12 : 3, 0, 0],
    }));

    const content: Content[] = [
      // Masthead: brand on the left, document identity + dates on the right.
      {
        columns: [
          {
            width: '*',
            stack: brandStack,
          },
          {
            width: 200,
            stack: [
              { text: data.docType, style: 'docType' },
              { text: data.number, style: 'docNumber' },
              ...dateRows,
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

      // Issuer (FROM) and recipient (BILLED TO), side by side.
      {
        columns: [
          { width: '*', ...this.partyStack('FROM', data.biller) },
          { width: 24, text: '' },
          { width: '*', ...this.partyStack('BILLED TO', data.billedTo) },
        ],
        columnGap: 0,
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
      partyName: { fontSize: 13, bold: true, color: INK },
      partyDetail: { fontSize: 10, color: MUTED },
      partyLine: { fontSize: 9.5, color: MUTED, lineHeight: 1.35 },
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
            text: brandName.toUpperCase(),
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

  /**
   * Builds a labelled address block for one billing party, emitting only the
   * lines that carry a value so optional client/workspace fields stay clean.
   */
  private partyStack(
    label: string,
    party: PdfParty,
  ): { stack: Content[] } {
    const lines: Content[] = [
      { text: label, style: 'eyebrow' },
      { text: party.name, style: 'partyName', margin: [0, 5, 0, 0] },
    ];
    if (party.detail?.trim()) {
      lines.push({ text: party.detail, style: 'partyDetail', margin: [0, 2, 0, 0] });
    }

    const locality = [party.city, party.postCode, party.country]
      .map((v) => v?.trim())
      .filter((v): v is string => !!v)
      .join(', ');
    const addressLines = [party.address?.trim(), locality].filter(
      (v): v is string => !!v,
    );
    if (addressLines.length) {
      lines.push({
        text: addressLines.join('\n'),
        style: 'partyLine',
        margin: [0, 6, 0, 0],
      });
    }

    const contactLines = [party.email?.trim(), party.phone?.trim(), party.website?.trim()].filter(
      (v): v is string => !!v,
    );
    if (contactLines.length) {
      lines.push({
        text: contactLines.join('\n'),
        style: 'partyLine',
        margin: [0, 6, 0, 0],
      });
    }

    if (party.taxId?.trim()) {
      lines.push({
        text: `${party.taxLabel ?? 'Tax ID'}: ${party.taxId.trim()}`,
        style: 'partyLine',
        margin: [0, 6, 0, 0],
      });
    }

    return { stack: lines };
  }
}
