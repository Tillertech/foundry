import type {
  ClientModel as Client,
  InvoiceModel as Invoice,
  InvoiceItemModel as InvoiceItem,
  PaymentModel as Payment,
} from '../../generated/prisma/models';

/**
 * An invoice line; `expense` is loaded where the emitter included it (the
 * send path does) and only feeds the expense date shown in mails/PDFs.
 */
export type InvoiceEventItem = InvoiceItem & {
  expense?: { date: Date } | null;
};

export const InvoiceEvents = {
  SENT: 'invoice.sent',
  PAID: 'invoice.paid',
  PARTIALLY_PAID: 'invoice.partially_paid',
  REMINDER_DUE: 'invoice.reminder_due',
} as const;

export interface InvoiceSentEvent {
  invoice: Invoice & { items: InvoiceEventItem[] };
  client: Client;
}

/** Emitted when reconciliation settles an invoice in full (or it is force-marked paid). */
export interface InvoicePaidEvent {
  invoice: Invoice & { items: InvoiceEventItem[] };
  client: Client;
  /** Amount still owed in the invoice currency; negative when overpaid. */
  balance: number;
  /**
   * The payment that settled the invoice, when the settlement was triggered
   * by one (a create or an amount adjustment). Absent on the rare case of a
   * reversal landing exactly on a zero balance - there is no single payment
   * to issue a receipt for there.
   */
  payment?: Payment;
}

/** Emitted when a payment leaves the invoice still owing a balance (previous or first partial payment). */
export interface InvoicePartiallyPaidEvent {
  invoice: Invoice & { items: InvoiceEventItem[] };
  client: Client;
  /** The payment that triggered this update. */
  payment: Payment;
  /** Amount still owed in the invoice currency (always > 0). */
  balance: number;
}

/** Emitted by the reminder schedule for invoices approaching or past their due date. */
export interface InvoiceReminderDueEvent {
  invoice: Invoice & { items: InvoiceEventItem[] };
  client: Client;
}
