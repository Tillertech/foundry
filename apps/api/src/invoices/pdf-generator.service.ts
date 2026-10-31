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
  /** Visual overrides; anything left out keeps Foundry's default look. */
  theme?: PdfTheme;
}

export type PdfDocumentKind = 'invoice' | 'quote' | 'receipt';

/**
 * Optional styling for generated documents. Every field is optional and
 * falls back to Foundry's built-in design, so a partial theme (just an
 * accent colour, say) is fine.
 */
export interface PdfTheme {
  /** Document number, totals, accent bar and rules. Hex, e.g. "#ea580c". */
  accent?: string;
  /** Body text. */
  ink?: string;
  /** Labels and secondary text. */
  muted?: string;
  /** Hairline rules. */
  line?: string;
  /** Items-table header: solid fill, accent underline, or a plain hairline. */
  headerStyle?: 'solid' | 'underline' | 'minimal';
  /** Fill for the solid header style. */
  headerFill?: string;
  /** Alternate-row shading in the items table. */
  striped?: boolean;
  density?: 'compact' | 'comfortable' | 'spacious';
  /** One of the PDF standard font families (no embedding needed). */
  font?: 'Helvetica' | 'Times' | 'Courier';
  pageSize?: 'A4' | 'LETTER' | 'LEGAL';
  /** Page margins in points. */
  margins?: { x: number; y: number };
  /** Thin accent bar under the masthead. */
  accentBar?: boolean;
  showLogo?: boolean;
  showNotes?: boolean;
  showPageNumbers?: boolean;
  /** Closing line; an empty string hides it. */
  thankYou?: string;
  /** Extra blocks printed after the notes. */
  terms?: string;
  paymentInstructions?: string;
  /** Left side of the page footer (defaults to the brand name). */
  footerText?: string;
}

/**
 * Supplies a theme per workspace and document kind. Provide it from a global
 * module to restyle generated documents (see EXTENDING.md); without one,
 * every document uses the default design.
 */
export interface PdfThemeResolver {
  resolve(request: {
    workspaceId: string;
    kind: PdfDocumentKind;
  }): Promise<PdfTheme | null | undefined>;
}

export const PDF_THEME_RESOLVER = Symbol('PDF_THEME_RESOLVER');

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

export interface PdfLineItem {
  description: string;
  quantity: number;
  rate: number;
  /** Set on lines re-billing a billable expense - rendered in their own section. */
  expense?: { date: string };
}

export interface InvoicePdfData {
  number: string;
  biller: PdfParty;
  billedTo: PdfParty;
  issueDate: string;
  dueDate: string;
  currency: string;
  items: PdfLineItem[];
  taxRate: number;
  discount: number;
  notes?: string;
  brand?: PdfBrand;
}

export interface ReceiptPdfData {
  receiptNumber: string;
  invoiceNumber: string;
  biller: PdfParty;
  billedTo: PdfParty;
  paymentDate: string;
  paymentMethod: string;
  paymentReference?: string;
  currency: string;
  /** Amount received in this specific payment. */
  paymentAmount: number;
  invoiceTotal: number;
  /** Total received against the invoice to date, including this payment. */
  amountPaidToDate: number;
  /** Amount still owed after this payment; 0 once settled. */
  balanceDue: number;
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
  items: PdfLineItem[];
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
const SETTLED = '#16a34a'; // paid-in-full status
const PARTIAL = '#2563eb'; // partial-payment status

const TOTALS_WIDTH = 220;

/** Page widths in points for the supported sizes. */
const PAGE_WIDTH: Record<NonNullable<PdfTheme['pageSize']>, number> = {
  A4: 595.28,
  LETTER: 612,
  LEGAL: 612,
};

const PADDING: Record<NonNullable<PdfTheme['density']>, [number, number]> = {
  compact: [4, 6],
  comfortable: [7, 9],
  spacious: [10, 12],
};

/** A theme with every default filled in. */
interface ResolvedTheme {
  ink: string;
  muted: string;
  faint: string;
  accent: string;
  accentBar: string;
  accentSoft: string;
  line: string;
  zebra: string | null;
  headerStyle: NonNullable<PdfTheme['headerStyle']>;
  headerFill: string;
  font: NonNullable<PdfTheme['font']>;
  pageSize: NonNullable<PdfTheme['pageSize']>;
  marginX: number;
  marginY: number;
  contentWidth: number;
  padding: [number, number];
  showAccentBar: boolean;
  showLogo: boolean;
  showNotes: boolean;
  showPageNumbers: boolean;
  thankYou: string | undefined;
  terms: string | undefined;
  paymentInstructions: string | undefined;
  footerText: string | undefined;
}

const HEX = /^#[0-9a-f]{6}$/i;

/** Mixes a hex colour towards white (amount 0..1) - pdfmake has no fill opacity on tables. */
function tint(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(mix);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

function resolveTheme(theme: PdfTheme | undefined): ResolvedTheme {
  const t = theme ?? {};
  const color = (value: string | undefined, fallback: string) =>
    value && HEX.test(value) ? value : fallback;
  const accent = color(t.accent, ACCENT);
  const pageSize = t.pageSize ?? 'A4';
  const marginX = clamp(t.margins?.x ?? 40, 24, 96);
  const marginY = clamp(t.margins?.y ?? 56, 24, 96);
  return {
    ink: color(t.ink, INK),
    muted: color(t.muted, MUTED),
    faint: FAINT,
    accent,
    accentBar: t.accent ? accent : ACCENT_BAR,
    accentSoft: t.accent ? tint(accent, 0.9) : ACCENT_SOFT,
    line: color(t.line, LINE),
    zebra:
      t.striped === false
        ? null
        : t.accent && t.striped
          ? tint(accent, 0.96)
          : ZEBRA,
    headerStyle: t.headerStyle ?? 'solid',
    headerFill: color(t.headerFill, HEADER_BG),
    font: t.font ?? 'Helvetica',
    pageSize,
    marginX,
    marginY,
    contentWidth: PAGE_WIDTH[pageSize] - marginX * 2,
    padding: PADDING[t.density ?? 'comfortable'],
    showAccentBar: t.accentBar ?? true,
    showLogo: t.showLogo ?? true,
    showNotes: t.showNotes ?? true,
    showPageNumbers: t.showPageNumbers ?? true,
    thankYou: t.thankYou,
    terms: t.terms?.trim() || undefined,
    paymentInstructions: t.paymentInstructions?.trim() || undefined,
    footerText: t.footerText?.trim() || undefined,
  };
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

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
      Times: {
        normal: 'Times-Roman',
        bold: 'Times-Bold',
        italics: 'Times-Italic',
        bolditalics: 'Times-BoldItalic',
      },
      Courier: {
        normal: 'Courier',
        bold: 'Courier-Bold',
        italics: 'Courier-Oblique',
        bolditalics: 'Courier-BoldOblique',
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

  /** Payment receipt confirming an invoice payment - full settlement or a partial installment. */
  async receiptPdf(data: ReceiptPdfData): Promise<Buffer> {
    const t = resolveTheme(data.brand?.theme);
    const money = (n: number) => this.money(data.currency, n);
    const settled = data.balanceDue <= 0;
    const statusLabel = settled ? 'PAID IN FULL' : 'PARTIAL PAYMENT';
    const statusColor = settled ? SETTLED : PARTIAL;

    const brandName = data.brand?.name?.trim() || 'FOUNDRY';
    const brandSub = data.brand?.subName?.trim() || 'Studio Workspace';
    const brandStack: Content[] =
      t.showLogo && data.brand?.logoDataUrl
        ? [
            { image: data.brand.logoDataUrl, fit: [150, 48] },
            { text: brandName, style: 'brandSub', margin: [0, 6, 0, 0] },
          ]
        : [
            { text: brandName.toUpperCase(), style: 'brand' },
            { text: brandSub, style: 'brandSub' },
          ];

    const summaryBody: TableCell[][] = [
      [
        { text: 'Invoice', style: 'sumLabel' },
        { text: data.invoiceNumber, style: 'sumValue' },
      ],
      [
        { text: 'Payment method', style: 'sumLabel' },
        { text: data.paymentMethod, style: 'sumValue' },
      ],
    ];
    if (data.paymentReference?.trim()) {
      summaryBody.push([
        { text: 'Reference', style: 'sumLabel' },
        { text: data.paymentReference.trim(), style: 'sumValue' },
      ]);
    }
    summaryBody.push([
      { text: 'Invoice total', style: 'sumLabel' },
      { text: money(data.invoiceTotal), style: 'sumValue' },
    ]);
    summaryBody.push([
      { text: 'Paid to date', style: 'sumLabel' },
      { text: money(data.amountPaidToDate), style: 'sumValue' },
    ]);
    summaryBody.push([
      { text: 'Balance due', style: 'sumLabel' },
      {
        text: money(Math.max(0, data.balanceDue)),
        style: 'sumValue',
        color: settled ? undefined : DANGER,
      },
    ]);
    summaryBody.push([
      { text: 'Amount received', style: 'sumTotalLabel' },
      { text: money(data.paymentAmount), style: 'sumTotalValue' },
    ]);

    const summaryLayout: CustomTableLayout = {
      hLineWidth: (i, node) => (i === node.table.body.length - 1 ? 1 : 0),
      vLineWidth: () => 0,
      hLineColor: () => t.accentBar,
      fillColor: (rowIndex, node) =>
        rowIndex === node.table.body.length - 1 ? t.accentSoft : null,
      paddingLeft: (col) => (col === 0 ? 12 : 8),
      paddingRight: (col) => (col === 0 ? 12 : 12),
      paddingTop: (i, node) => (i === node.table.body.length - 1 ? 9 : 5),
      paddingBottom: (i, node) => (i === node.table.body.length - 1 ? 9 : 5),
    };

    const content: Content[] = [
      {
        columns: [
          { width: '*', stack: brandStack },
          {
            width: 200,
            stack: [
              { text: 'RECEIPT', style: 'docType' },
              { text: data.receiptNumber, style: 'docNumber' },
              {
                text: statusLabel,
                style: 'statusLabel',
                color: statusColor,
                margin: [0, 6, 0, 0],
              },
              {
                columns: [
                  {
                    text: 'Paid on',
                    style: 'metaLabel',
                    alignment: 'right' as Alignment,
                  },
                  {
                    text: data.paymentDate,
                    style: 'metaValue',
                    alignment: 'right' as Alignment,
                    width: 96,
                  },
                ],
                margin: [0, 10, 0, 0],
              },
            ],
          },
        ],
        margin: [0, 0, 0, 16],
      },
      {
        canvas: [
          {
            type: 'rect',
            x: 0,
            y: 0,
            w: t.contentWidth,
            h: 3,
            color: statusColor,
          },
        ],
        margin: [0, 0, 0, 22],
      },
      {
        columns: [
          { width: '*', ...this.partyStack('FROM', data.biller) },
          { width: 24, text: '' },
          { width: '*', ...this.partyStack('RECEIVED FROM', data.billedTo) },
        ],
        columnGap: 0,
        margin: [0, 0, 0, 30],
      },
      {
        columns: [
          { width: '*', text: '' },
          {
            width: TOTALS_WIDTH,
            table: { widths: ['*', 'auto'], body: summaryBody },
            layout: summaryLayout,
          },
        ],
      },
    ];

    content.push({
      text: settled
        ? 'This invoice is fully settled. Thank you for your business.'
        : 'Thank you for your payment - a balance remains outstanding on this invoice.',
      style: 'thanks',
      margin: [0, 36, 0, 0],
    });

    const styles: StyleDictionary = {
      brand: { fontSize: 26, bold: true, color: t.ink, characterSpacing: 2 },
      brandSub: { fontSize: 10, color: t.muted, characterSpacing: 1 },
      docType: {
        fontSize: 13,
        bold: true,
        color: t.muted,
        alignment: 'right',
        characterSpacing: 3,
      },
      docNumber: {
        fontSize: 22,
        bold: true,
        color: t.accent,
        alignment: 'right',
        margin: [0, 3, 0, 0],
      },
      statusLabel: {
        fontSize: 11,
        bold: true,
        alignment: 'right',
        characterSpacing: 1,
      },
      eyebrow: {
        fontSize: 8,
        bold: true,
        color: t.faint,
        characterSpacing: 1.5,
      },
      partyName: { fontSize: 13, bold: true, color: t.ink },
      partyDetail: { fontSize: 10, color: t.muted },
      partyLine: { fontSize: 9.5, color: t.muted, lineHeight: 1.35 },
      metaLabel: { fontSize: 10, color: t.muted },
      metaValue: { fontSize: 10, bold: true, color: t.ink },
      sumLabel: { fontSize: 10, color: t.muted },
      sumValue: { fontSize: 10, color: t.ink, alignment: 'right' },
      sumTotalLabel: { fontSize: 12, bold: true, color: t.ink },
      sumTotalValue: {
        fontSize: 12,
        bold: true,
        color: t.accent,
        alignment: 'right',
      },
      thanks: {
        fontSize: 10,
        color: t.faint,
        alignment: 'center',
        characterSpacing: 0.5,
      },
    };

    const definition: TDocumentDefinitions = {
      pageSize: t.pageSize,
      defaultStyle: { font: t.font, fontSize: 10, color: t.ink },
      pageMargins: [t.marginX, t.marginY, t.marginX, t.marginY + 8],
      content,
      styles,
      footer: (currentPage, pageCount) => ({
        margin: [t.marginX, 0, t.marginX, 32],
        columns: [
          {
            text: (t.footerText ?? brandName).toUpperCase(),
            fontSize: 8,
            bold: true,
            color: t.faint,
            characterSpacing: 1,
          },
          {
            text: t.showPageNumbers
              ? `Page ${currentPage} of ${pageCount}`
              : '',
            fontSize: 8,
            color: t.faint,
            alignment: 'right',
          },
        ],
      }),
    };

    return pdfmake.createPdf(definition).getBuffer();
  }

  private money(currency: string, n: number): string {
    return `${currency} ${n.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

  private async documentPdf(data: DocumentPdfData): Promise<Buffer> {
    const t = resolveTheme(data.brand?.theme);
    const discount = Math.max(0, data.discount || 0);
    const taxRate = data.taxRate || 0;
    const subtotal = data.items.reduce((s, it) => s + it.quantity * it.rate, 0);
    const afterDiscount = Math.max(0, subtotal - discount);
    const tax = afterDiscount * (taxRate / 100);
    const total = afterDiscount + tax;

    const money = (n: number) => this.money(data.currency, n);
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
      // Rule under the header row (underline/minimal styles) and at the end.
      hLineWidth: (i, node) => {
        if (i === node.table.body.length) return 0.5;
        if (i === 1 && t.headerStyle === 'underline') return 1.5;
        if (i === 1 && t.headerStyle === 'minimal') return 0.5;
        return 0;
      },
      vLineWidth: () => 0,
      hLineColor: (i) =>
        i === 1 && t.headerStyle === 'underline' ? t.accent : t.line,
      fillColor: (rowIndex) => {
        if (rowIndex === 0)
          return t.headerStyle === 'solid' ? t.headerFill : null;
        return rowIndex % 2 === 0 ? t.zebra : null;
      },
      paddingLeft: () => 10,
      paddingRight: () => 10,
      paddingTop: (i) => (i === 0 ? t.padding[1] : t.padding[0]),
      paddingBottom: (i) => (i === 0 ? t.padding[1] : t.padding[0]),
    };

    const regular = data.items.filter((it) => !it.expense);
    const expenses = data.items.filter((it) => it.expense);
    const lineSum = (items: PdfLineItem[]) =>
      items.reduce((s, it) => s + it.quantity * it.rate, 0);

    const totalsBody: TableCell[][] = [];
    // With re-billed expenses on the invoice, break the subtotal down so the
    // pass-through costs are visible at a glance.
    if (expenses.length > 0) {
      totalsBody.push(
        [
          { text: 'Services', style: 'sumLabel' },
          { text: money(lineSum(regular)), style: 'sumValue' },
        ],
        [
          { text: 'Billable expenses', style: 'sumLabel' },
          { text: money(lineSum(expenses)), style: 'sumValue' },
        ],
      );
    }
    totalsBody.push([
      { text: 'Subtotal', style: 'sumLabel' },
      { text: money(subtotal), style: 'sumValue' },
    ]);
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
      hLineColor: () => t.accentBar,
      fillColor: (rowIndex, node) =>
        rowIndex === node.table.body.length - 1 ? t.accentSoft : null,
      paddingLeft: (col) => (col === 0 ? 12 : 8),
      paddingRight: (col) => (col === 0 ? 12 : 12),
      paddingTop: (i, node) => (i === node.table.body.length - 1 ? 9 : 5),
      paddingBottom: (i, node) => (i === node.table.body.length - 1 ? 9 : 5),
    };

    const brandName = data.brand?.name?.trim() || 'FOUNDRY';
    const brandSub = data.brand?.subName?.trim() || 'Studio Workspace';
    const brandStack: Content[] =
      t.showLogo && data.brand?.logoDataUrl
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
        {
          text: date.label,
          style: 'metaLabel',
          alignment: 'right' as Alignment,
        },
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

      // Brand accent bar in place of a plain divider (a hairline when off).
      {
        canvas: [
          {
            type: 'rect',
            x: 0,
            y: 0,
            w: t.contentWidth,
            h: t.showAccentBar ? 3 : 0.5,
            color: t.showAccentBar ? t.accentBar : t.line,
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
      ...(regular.length > 0 || expenses.length === 0
        ? [
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
                  ...regular.map((it) => [
                    td(it.description),
                    td(qty(it.quantity), 'right'),
                    td(money(it.rate), 'right'),
                    td(money(it.quantity * it.rate), 'right'),
                  ]),
                ],
              },
              layout: itemsLayout,
            } as Content,
          ]
        : []),

      // Re-billed expenses, charged at cost - their own table so they read
      // as pass-through costs rather than billed work.
      ...(expenses.length > 0
        ? [
            {
              text: 'BILLABLE EXPENSES',
              style: 'eyebrow',
              margin: [0, regular.length > 0 ? 20 : 0, 0, 6],
            } as Content,
            {
              table: {
                widths: ['*', 'auto', 'auto'],
                headerRows: 1,
                body: [
                  [th('Expense'), th('Date', 'right'), th('Amount', 'right')],
                  ...expenses.map((it) => [
                    td(it.description),
                    td(it.expense?.date || '-', 'right'),
                    td(money(it.quantity * it.rate), 'right'),
                  ]),
                ],
              },
              layout: itemsLayout,
            } as Content,
          ]
        : []),

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

    if (data.notes && t.showNotes) {
      content.push({
        margin: [0, 32, 0, 0],
        stack: [
          { text: 'NOTES', style: 'eyebrow' },
          { text: data.notes, style: 'notes', margin: [0, 5, 0, 0] },
        ],
      });
    }

    for (const [label, text] of [
      ['TERMS', t.terms],
      ['PAYMENT', t.paymentInstructions],
    ] as const) {
      if (!text) continue;
      content.push({
        margin: [0, 20, 0, 0],
        stack: [
          { text: label, style: 'eyebrow' },
          { text, style: 'notes', margin: [0, 5, 0, 0] },
        ],
      });
    }

    const thankYou = t.thankYou ?? 'Thank you for your business.';
    if (thankYou.trim()) {
      content.push({
        text: thankYou,
        style: 'thanks',
        margin: [0, 36, 0, 0],
      });
    }

    const styles: StyleDictionary = {
      brand: { fontSize: 26, bold: true, color: t.ink, characterSpacing: 2 },
      brandSub: { fontSize: 10, color: t.muted, characterSpacing: 1 },
      docType: {
        fontSize: 13,
        bold: true,
        color: t.muted,
        alignment: 'right',
        characterSpacing: 3,
      },
      docNumber: {
        fontSize: 22,
        bold: true,
        color: t.accent,
        alignment: 'right',
        margin: [0, 3, 0, 0],
      },
      eyebrow: {
        fontSize: 8,
        bold: true,
        color: t.faint,
        characterSpacing: 1.5,
      },
      partyName: { fontSize: 13, bold: true, color: t.ink },
      partyDetail: { fontSize: 10, color: t.muted },
      partyLine: { fontSize: 9.5, color: t.muted, lineHeight: 1.35 },
      metaLabel: { fontSize: 10, color: t.muted },
      metaValue: { fontSize: 10, bold: true, color: t.ink },
      th: {
        fontSize: 9,
        bold: true,
        color: t.headerStyle === 'solid' ? '#ffffff' : t.muted,
        characterSpacing: 0.5,
      },
      cell: { fontSize: 10, color: t.ink },
      sumLabel: { fontSize: 10, color: t.muted },
      sumValue: { fontSize: 10, color: t.ink, alignment: 'right' },
      sumTotalLabel: { fontSize: 12, bold: true, color: t.ink },
      sumTotalValue: {
        fontSize: 12,
        bold: true,
        color: t.accent,
        alignment: 'right',
      },
      notes: { fontSize: 10, color: t.muted, lineHeight: 1.3 },
      thanks: {
        fontSize: 10,
        color: t.faint,
        alignment: 'center',
        characterSpacing: 0.5,
      },
    };

    const definition: TDocumentDefinitions = {
      pageSize: t.pageSize,
      defaultStyle: { font: t.font, fontSize: 10, color: t.ink },
      pageMargins: [t.marginX, t.marginY, t.marginX, t.marginY + 8],
      content,
      styles,
      footer: (currentPage, pageCount) => ({
        margin: [t.marginX, 0, t.marginX, 32],
        columns: [
          {
            text: (t.footerText ?? brandName).toUpperCase(),
            fontSize: 8,
            bold: true,
            color: t.faint,
            characterSpacing: 1,
          },
          {
            text: t.showPageNumbers
              ? `Page ${currentPage} of ${pageCount}`
              : '',
            fontSize: 8,
            color: t.faint,
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
  private partyStack(label: string, party: PdfParty): { stack: Content[] } {
    const lines: Content[] = [
      { text: label, style: 'eyebrow' },
      { text: party.name, style: 'partyName', margin: [0, 5, 0, 0] },
    ];
    if (party.detail?.trim()) {
      lines.push({
        text: party.detail,
        style: 'partyDetail',
        margin: [0, 2, 0, 0],
      });
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

    const contactLines = [
      party.email?.trim(),
      party.phone?.trim(),
      party.website?.trim(),
    ].filter((v): v is string => !!v);
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
