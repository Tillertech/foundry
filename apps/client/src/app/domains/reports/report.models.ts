import { Currency } from '../shared/models';
import { InvoiceStatus } from '../invoices/invoice.models';

export interface ReportStatusCount {
  status: InvoiceStatus;
  count: number;
}

export interface ReportMonth {
  /** Calendar month (YYYY-MM). */
  month: string;
  collected: number;
  expenses: number;
}

export interface ReportClient {
  clientId: string;
  name: string;
  invoiced: number;
  collected: number;
}

export interface ReportCategory {
  category: string;
  amount: number;
}

/** Payments grouped by the currency the customer actually paid with. */
export interface ReportCurrency {
  currency: Currency;
  count: number;
  /** Total in the paid currency. */
  amount: number;
  /** Same total converted into the workspace currency. */
  converted: number;
}

/** All converted amounts are in the workspace currency (`currency`). */
export interface ReportSummary {
  currency: Currency;
  from: string | null;
  to: string | null;
  invoiced: number;
  collected: number;
  outstanding: number;
  overdue: number;
  expenses: number;
  netProfit: number;
  invoiceCount: number;
  paidInvoiceCount: number;
  avgInvoiceValue: number;
  paymentCount: number;
  invoicesByStatus: ReportStatusCount[];
  monthly: ReportMonth[];
  topClients: ReportClient[];
  expensesByCategory: ReportCategory[];
  paymentsByCurrency: ReportCurrency[];
}

export interface ReportSummaryQuery {
  from?: string;
  to?: string;
}
