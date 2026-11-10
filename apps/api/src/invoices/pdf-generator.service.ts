import { Injectable } from '@nestjs/common';
import { existsSync } from 'fs';
import { join } from 'path';
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

/**
 * Inter (SIL OFL, src/assets/fonts/inter) is embedded so documents look the
 * same in every viewer. The bundle runs from dist (assets copied next to
 * main.js); tests and tools run from source. Null when not found - documents
 * then fall back to Helvetica.
 */
const INTER_DIR =
  [
    join(__dirname, 'assets', 'fonts', 'inter'),
    join(__dirname, '..', 'assets', 'fonts', 'inter'),
    join(process.cwd(), 'apps', 'api', 'src', 'assets', 'fonts', 'inter'),
    join(process.cwd(), 'src', 'assets', 'fonts', 'inter'),
  ].find((dir) => existsSync(join(dir, 'Inter_400Regular.ttf'))) ?? null;

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
  /**
   * Helvetica/Times/Courier are PDF standard fonts (not embedded); Inter is
   * embedded. Quotes default to Inter, other documents to Helvetica.
   */
  font?: 'Helvetica' | 'Times' | 'Courier' | 'Inter';
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

export interface QuotePdfLine {
  description: string;
  quantity: number;
  rate: number;
}

/** A priced milestone and the scope the client will sign it off against. */
export interface QuotePdfMilestone {
  code: string;
  description: string;
  amount: number;
  details: string;
  deliverables: string[];
  acceptanceCriteria: string;
  /** A picked add-on slotted into the schedule. */
  option: boolean;
  /** The hand-over; releases retention. */
  final: boolean;
}

export interface QuotePdfData {
  number: string;
  biller: PdfParty;
  billedTo: PdfParty;
  issueDate: string;
  validUntil: string;
  currency: string;
  /** Milestones (and picked options) in billing order: priced on page one, scoped after it. */
  milestones: QuotePdfMilestone[];
  /** One-off lines that aren't milestones. */
  lines: QuotePdfLine[];
  /** Monthly charges, quoted alongside the total. */
  recurring: QuotePdfLine[];
  /** Third-party costs billed at cost - an estimate, not in the total. */
  passThrough: QuotePdfLine[];
  /** Options the client hasn't taken up. */
  optional: QuotePdfLine[];
  taxRate: number;
  retentionPercent: number;
  notes?: string;
  /** Names of supporting documents sent with the quote. */
  attachments: string[];
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
    font: t.font === 'Inter' && !INTER_DIR ? 'Helvetica' : (t.font ?? 'Helvetica'),
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
      ...(INTER_DIR
        ? {
            // "Bold" is SemiBold: firm without shouting.
            Inter: {
              normal: join(INTER_DIR, 'Inter_400Regular.ttf'),
              bold: join(INTER_DIR, 'Inter_600SemiBold.ttf'),
              italics: join(INTER_DIR, 'Inter_400Regular_Italic.ttf'),
              bolditalics: join(INTER_DIR, 'Inter_600SemiBold_Italic.ttf'),
            },
            // For titles that should read as headings without heavy weight.
            InterMedium: {
              normal: join(INTER_DIR, 'Inter_500Medium.ttf'),
              bold: join(INTER_DIR, 'Inter_600SemiBold.ttf'),
              italics: join(INTER_DIR, 'Inter_500Medium_Italic.ttf'),
              bolditalics: join(INTER_DIR, 'Inter_600SemiBold_Italic.ttf'),
            },
          }
        : {}),
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

    const chrome = this.chrome(t, data);

    const content: Content[] = [
      ...chrome.head,

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

    const definition: TDocumentDefinitions = {
      pageSize: t.pageSize,
      defaultStyle: { font: t.font, fontSize: 10, color: t.ink },
      pageMargins: [t.marginX, t.marginY, t.marginX, t.marginY + 8],
      content,
      styles: chrome.styles,
      footer: chrome.footer,
    };

    return pdfmake.createPdf(definition).getBuffer();
  }

  /**
   * The quote: page one is the priced proposal (milestones, other lines,
   * totals, what's quoted outside the total, notes); when any milestone has
   * written scope, it follows on its own page(s) - one block per milestone
   * with what's delivered and when it counts as signed off.
   */
  quotePdf(data: QuotePdfData): Promise<Buffer> {
    const t = resolveTheme({
      ...data.brand?.theme,
      font: data.brand?.theme?.font ?? (INTER_DIR ? 'Inter' : undefined),
    });
    // Titles in Inter Medium rather than bold; other fonts keep their bold.
    const heading = (size: number, color = t.ink) =>
      t.font === 'Inter'
        ? { font: 'InterMedium', bold: false, fontSize: size, color }
        : { bold: true, fontSize: size, color };
    // Inter's line box is taller than Helvetica's; tighten it to keep the same rhythm.
    const tight = t.font === 'Inter';
    const lh = (n: number) => (tight ? Math.max(1, n - 0.12) : n);
    const money = (n: number) => this.money(data.currency, n);
    const qty = (n: number) => n.toLocaleString('en-US');
    const amount = (l: QuotePdfLine) => l.quantity * l.rate;
    const subtotal =
      data.milestones.reduce((s, m) => s + m.amount, 0) +
      data.lines.reduce((s, l) => s + amount(l), 0);
    const taxRate = data.taxRate || 0;
    const tax = subtotal * (taxRate / 100);
    const total = subtotal + tax;
    const retention = Math.max(0, data.retentionPercent || 0);
    const scoped = data.milestones.some(
      (m) => m.details || m.deliverables.length || m.acceptanceCriteria,
    );

    const chrome = this.chrome(t, {
      brand: data.brand,
      biller: data.biller,
      billedTo: data.billedTo,
      docType: 'QUOTE',
      number: data.number,
      dates: [
        { label: 'Issued', value: data.issueDate },
        { label: 'Valid until', value: data.validUntil },
      ],
    }, t.font === 'Inter');

    const th = (text: string, align: Alignment = 'left', colSpan = 1): TableCell => ({
      text,
      style: 'qth',
      alignment: align,
      colSpan,
    });
    const td = (text: string, align: Alignment = 'left'): TableCell => ({
      text,
      style: 'cell',
      alignment: align,
    });

    // Open tables: an ink rule under the header, hairlines between rows.
    const openLayout = (header: boolean): CustomTableLayout => ({
      hLineWidth: (i) => (i === 0 ? 0 : header && i === 1 ? 1 : 0.5),
      vLineWidth: () => 0,
      hLineColor: (i) => (header && i === 1 ? t.ink : t.line),
      paddingLeft: (col) => (col === 0 ? 0 : 8),
      paddingRight: (col, node) =>
        col === (node.table.widths?.length ?? 1) - 1 ? 0 : 8,
      paddingTop: (i) => (header && i === 0 ? 0 : t.padding[0] - (tight ? 1 : -1)),
      paddingBottom: (i) => (header && i === 0 ? 6 : t.padding[0] - (tight ? 1 : -1)),
    });

    const scopeHint = (m: QuotePdfMilestone): string => {
      const n = m.deliverables.length;
      const parts = [
        n ? `${n} deliverable${n === 1 ? '' : 's'}` : '',
        m.acceptanceCriteria ? 'sign-off criteria' : '',
      ].filter(Boolean);
      return parts.length ? `${parts.join(' and ')} in the milestone scope` : '';
    };

    const content: Content[] = [...chrome.head];

    if (data.milestones.length) {
      content.push(
        {
          table: {
            widths: [30, '*', 'auto'],
            headerRows: 1,
            dontBreakRows: true,
            body: [
              [th('MILESTONES', 'left', 2), '', th('AMOUNT', 'right')],
              ...data.milestones.map((m): TableCell[] => [
                { text: m.code, style: 'code' },
                {
                  stack: [
                    {
                      text: [
                        m.description,
                        m.option ? { text: '   ADD-ON', style: 'tag' } : '',
                      ],
                      style: 'cellStrong',
                    },
                    ...(scopeHint(m)
                      ? [
                          {
                            text: scopeHint(m),
                            style: 'cellHint',
                            margin: [0, 2, 0, 0],
                          } as Content,
                        ]
                      : []),
                  ],
                },
                td(money(m.amount), 'right'),
              ]),
            ],
          },
          layout: openLayout(true),
        },
      );
      if (scoped) {
        // Points at the scope pages rather than repeating them here.
        content.push({
          text: [
            { text: 'Milestone scope  ', bold: true, color: t.accent },
            'What each milestone delivers, and what counts as signing it off, follows on the next pages. Each milestone is invoiced once you sign it off against that scope.',
          ],
          style: 'fine',
          lineHeight: lh(1.3),
          margin: [0, 8, 0, 0],
        });
      }
    }

    if (data.lines.length) {
      content.push(
        {
          margin: [0, data.milestones.length ? 20 : 0, 0, 0],
          table: {
            widths: ['*', 'auto', 'auto', 'auto'],
            headerRows: 1,
            dontBreakRows: true,
            body: [
              [
                th(data.milestones.length ? 'ALSO INCLUDED' : 'SERVICES'),
                th('QTY', 'right'),
                th('RATE', 'right'),
                th('AMOUNT', 'right'),
              ],
              ...data.lines.map((l) => [
                td(l.description),
                td(qty(l.quantity), 'right'),
                td(money(l.rate), 'right'),
                td(money(amount(l)), 'right'),
              ]),
            ],
          },
          layout: openLayout(true),
        },
      );
    }

    // Totals: quiet rows, then the total on an ink rule in the accent colour.
    const totalsLayout: CustomTableLayout = {
      hLineWidth: (i, node) => (i === node.table.body.length - 1 ? 1.25 : 0),
      vLineWidth: () => 0,
      hLineColor: () => t.ink,
      paddingLeft: () => 0,
      paddingRight: () => 0,
      paddingTop: (i, node) => (i === node.table.body.length - 1 ? 9 : 3),
      paddingBottom: () => 3,
    };
    content.push({
      margin: [0, 18, 0, 0],
      unbreakable: true,
      stack: [
        {
          columns: [
            { width: '*', text: '' },
            {
              width: TOTALS_WIDTH,
              table: {
                widths: ['*', 'auto'],
                body: [
                  [
                    { text: 'Subtotal', style: 'sumLabel' },
                    { text: money(subtotal), style: 'sumValue' },
                  ],
                  [
                    { text: `VAT (${taxRate}%)`, style: 'sumLabel' },
                    { text: money(tax), style: 'sumValue' },
                  ],
                  [
                    { text: 'Total', style: 'sumTotalLabel' },
                    { text: money(total), style: 'quoteTotal' },
                  ],
                ],
              },
              layout: totalsLayout,
            },
          ],
        },
        ...(retention > 0 && data.milestones.length > 1
          ? [
              {
                text: `${retention}% of each milestone invoice is held as retention and released with ${data.milestones[data.milestones.length - 1].code}.`,
                style: 'fine',
                alignment: 'right',
                margin: [0, 8, 0, 0],
              } as Content,
            ]
          : []),
      ],
    });

    // Quoted outside the total, in one compact table: monthly, at cost, optional.
    const outside = [
      ...data.recurring.map((l) => ({ l, kind: 'Monthly, after launch', suffix: ' / month' })),
      ...data.passThrough.map((l) => ({ l, kind: 'Third-party cost, billed at cost (estimate)', suffix: '' })),
      ...data.optional.map((l) => ({ l, kind: 'Optional add-on, not included unless chosen', suffix: '' })),
    ];
    if (outside.length) {
      content.push({
        margin: [0, 22, 0, 0],
        table: {
          widths: ['*', 'auto'],
          headerRows: 1,
          dontBreakRows: true,
          body: [
            [th('QUOTED SEPARATELY - NOT IN THE TOTAL'), th('AMOUNT', 'right')],
            ...outside.map(({ l, kind, suffix }): TableCell[] => [
              {
                text: [l.description, { text: `   ${kind}`, style: 'cellHint' }],
                style: 'cell',
              },
              td(`${money(amount(l))}${suffix}`, 'right'),
            ]),
          ],
        },
        layout: openLayout(true),
      });
    }

    if (data.notes && t.showNotes) {
      content.push({
        margin: [0, 22, 0, 0],
        stack: [
          { text: 'NOTES', style: 'eyebrow' },
          { text: data.notes, style: 'notes', margin: [0, 5, 0, 0] },
        ],
      });
    }

    if (data.attachments.length) {
      content.push({
        margin: [0, 20, 0, 0],
        stack: [
          { text: 'SUPPORTING DOCUMENTS', style: 'eyebrow' },
          {
            ul: data.attachments,
            style: 'notes',
            markerColor: t.faint,
            margin: [0, 5, 0, 0],
          },
        ],
      });
    }

    if (t.terms) {
      content.push({
        margin: [0, 20, 0, 0],
        stack: [
          { text: 'TERMS', style: 'eyebrow' },
          { text: t.terms, style: 'notes', margin: [0, 5, 0, 0] },
        ],
      });
    }

    if (scoped) content.push(...this.scopePages(t, data, money, retention, tight));

    const definition: TDocumentDefinitions = {
      pageSize: t.pageSize,
      defaultStyle: {
        font: t.font,
        fontSize: tight ? 9.5 : 10,
        color: t.ink,
        lineHeight: tight ? 0.95 : 1,
      },
      pageMargins: tight
        ? [t.marginX, t.marginY - 10, t.marginX, t.marginY - 2]
        : [t.marginX, t.marginY, t.marginX, t.marginY + 8],
      content,
      styles: {
        ...chrome.styles,
        ...(tight
          ? {
              brand: { fontSize: 18, bold: true, color: t.ink, characterSpacing: 1 },
              notes: { fontSize: 9.5, color: t.muted, lineHeight: lh(1.3) },
            }
          : {}),
        qth: { fontSize: 7.5, bold: true, color: t.muted, characterSpacing: 1 },
        code: { fontSize: 9, bold: true, color: t.accent, characterSpacing: 0.5 },
        cellStrong: heading(10.5),
        cellHint: { fontSize: 8.5, color: t.faint },
        tag: { fontSize: 7, bold: true, color: t.accent, characterSpacing: 1 },
        fine: { fontSize: 8.5, color: t.muted },
        quoteTotal: { fontSize: 15, bold: true, color: t.accent, alignment: 'right' },
        scopeTitle: heading(20),
        scopeIntro: { fontSize: 10, color: t.muted, lineHeight: lh(1.35) },
        msCode: { fontSize: 10, bold: true, color: t.accent, characterSpacing: 0.5 },
        msTitle: heading(13),
        msAmount: { ...heading(10.5), alignment: 'right' },
        msDetails: { fontSize: 10, color: t.ink, lineHeight: lh(1.4) },
        msLabel: { fontSize: 7.5, bold: true, color: t.faint, characterSpacing: 1.2 },
        msItem: { fontSize: 9.5, color: t.ink, lineHeight: lh(1.3) },
        msCriteria: { fontSize: 9.5, color: t.ink, lineHeight: lh(1.4) },
        msNone: { fontSize: 9, italics: true, color: t.faint },
      },
      footer: chrome.footer,
      info: { title: `Quote ${data.number}` },
    };
    return pdfmake.createPdf(definition).getBuffer();
  }

  /** The milestone scope, from a fresh page: one unbroken block per milestone. */
  private scopePages(
    t: ResolvedTheme,
    data: QuotePdfData,
    money: (n: number) => string,
    retention: number,
    tight = false,
  ): Content[] {
    const gap = tight ? 13 : 18;
    const several = data.milestones.length > 1;
    const blocks: Content[] = data.milestones.map((m, i) => {
      const received: Content[] = m.deliverables.length
        ? [
            { text: "YOU'LL RECEIVE", style: 'msLabel', margin: [0, 0, 0, 6] },
            {
              ul: m.deliverables.map((d) => ({
                text: d,
                style: 'msItem',
                margin: [0, 0, 0, 3],
              })),
              type: 'square',
              markerColor: t.accentBar,
            },
          ]
        : [];
      const signoff: Content[] = m.acceptanceCriteria
        ? [
            { text: 'SIGNED OFF WHEN', style: 'msLabel', margin: [0, 0, 0, 6] },
            {
              table: {
                widths: ['*'],
                body: [[{ text: m.acceptanceCriteria, style: 'msCriteria' }]],
              },
              layout: {
                hLineWidth: () => 0,
                vLineWidth: (col) => (col === 0 ? 2 : 0),
                vLineColor: () => t.accentBar,
                fillColor: () => t.zebra ?? ZEBRA,
                paddingLeft: () => 10,
                paddingRight: () => 10,
                paddingTop: () => 8,
                paddingBottom: () => 8,
              },
            },
          ]
        : [];

      const tags = [
        m.option ? 'Add-on' : '',
        m.final && several
          ? retention > 0
            ? `Final milestone, releases the ${retention}% retention`
            : 'Final milestone'
          : '',
      ].filter(Boolean);

      const inner: Content[] = [];
      if (m.details) {
        inner.push({ text: m.details, style: 'msDetails', margin: [0, 8, 0, 0] });
      }
      if (received.length && signoff.length) {
        inner.push({
          columns: [
            { width: '*', stack: received },
            { width: '*', stack: signoff },
          ],
          columnGap: 20,
          margin: [0, tight ? 9 : 12, 0, 0],
        });
      } else if (received.length || signoff.length) {
        inner.push({ stack: [...received, ...signoff], margin: [0, 12, 0, 0] });
      }
      if (!inner.length) {
        inner.push({
          text: 'Delivered as described in the quote.',
          style: 'msNone',
          margin: [0, 6, 0, 0],
        });
      }

      const block: Content[] = [];
      if (i > 0) {
        block.push({
          canvas: [
            {
              type: 'line',
              x1: 0,
              y1: 0,
              x2: t.contentWidth,
              y2: 0,
              lineWidth: 0.5,
              lineColor: t.line,
            },
          ],
          margin: [0, 0, 0, gap],
        });
      }
      block.push(
        {
          columns: [
            { width: 34, text: m.code, style: 'msCode', margin: [0, 2, 0, 0] },
            {
              width: '*',
              stack: [
                { text: m.description, style: 'msTitle' },
                ...(tags.length
                  ? [
                      {
                        text: tags.join('  ·  '),
                        style: 'cellHint',
                        margin: [0, 2, 0, 0],
                      } as Content,
                    ]
                  : []),
              ],
            },
            {
              width: 'auto',
              text: money(m.amount),
              style: 'msAmount',
              margin: [0, 2, 0, 0],
            },
          ],
          columnGap: 8,
        },
        { stack: inner, margin: [42, 0, 0, 0] },
      );
      return {
        stack: block,
        unbreakable: true,
        margin: [0, i === 0 ? 0 : gap, 0, 0],
      } as Content;
    });

    return [
      {
        pageBreak: 'before',
        columns: [
          { width: '*', text: 'MILESTONE SCOPE', style: 'eyebrow' },
          { width: 'auto', text: `Quote ${data.number}`, style: 'fine' },
        ],
      },
      {
        text: 'What each milestone delivers',
        style: 'scopeTitle',
        margin: [0, 6, 0, 0],
      },
      {
        text: 'Each milestone is complete when the work below is handed over and you confirm it meets its sign-off criteria. That sign-off triggers the milestone invoice.',
        style: 'scopeIntro',
        margin: [0, 6, 0, 0],
      },
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
        margin: [0, 16, 0, 22],
      },
      ...blocks,
    ];
  }

  /**
   * What every invoice/quote page shares: the masthead (brand left, document
   * identity and dates right), the accent bar, the two parties, the base
   * styles and the page footer.
   */
  private chrome(
    t: ResolvedTheme,
    data: {
      brand?: PdfBrand;
      docType: 'INVOICE' | 'QUOTE';
      number: string;
      dates: { label: string; value: string }[];
      biller: PdfParty;
      billedTo: PdfParty;
    },
    /** Tighter masthead spacing (taller-set fonts such as Inter). */
    compact = false,
  ): {
    head: Content[];
    styles: StyleDictionary;
    footer: TDocumentDefinitions['footer'];
  } {
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

    const head: Content[] = [
      // Masthead: brand on the left, document identity + dates on the right.
      {
        columns: [
          { width: '*', stack: brandStack },
          {
            width: 200,
            stack: [
              { text: data.docType, style: 'docType' },
              { text: data.number, style: 'docNumber' },
              ...dateRows,
            ],
          },
        ],
        margin: [0, 0, 0, compact ? 12 : 16],
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
        margin: [0, 0, 0, compact ? 16 : 22],
      },
      // Issuer and recipient, side by side.
      {
        columns: [
          { width: '*', ...this.partyStack('FROM', data.biller) },
          { width: 24, text: '' },
          {
            width: '*',
            ...this.partyStack(
              data.docType === 'QUOTE' ? 'PREPARED FOR' : 'BILLED TO',
              data.billedTo,
            ),
          },
        ],
        columnGap: 0,
        margin: [0, 0, 0, compact ? 18 : 26],
      },
    ];

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

    const footer: TDocumentDefinitions['footer'] = (currentPage, pageCount) => ({
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
          text: t.showPageNumbers ? `Page ${currentPage} of ${pageCount}` : '',
          fontSize: 8,
          color: t.faint,
          alignment: 'right',
        },
      ],
    });

    return { head, styles, footer };
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
