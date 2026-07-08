import type {
  ClientModel as Client,
  InvoiceModel as Invoice,
  InvoiceItemModel as InvoiceItem,
} from '../../generated/prisma/models';

export const InvoiceEvents = {
  SENT: 'invoice.sent',
  PAID: 'invoice.paid',
  REMINDER_DUE: 'invoice.reminder_due',
} as const;

export interface InvoiceSentEvent {
  invoice: Invoice & { items: InvoiceItem[] };
  client: Client;
}

/** Emitted when reconciliation settles an invoice in full (or it is force-marked paid). */
export interface InvoicePaidEvent {
  invoice: Invoice & { items: InvoiceItem[] };
  client: Client;
  /** Amount still owed in the invoice currency; negative when overpaid. */
  balance: number;
}

/** Emitted by the reminder schedule for invoices approaching or past their due date. */
export interface InvoiceReminderDueEvent {
  invoice: Invoice & { items: InvoiceItem[] };
  client: Client;
}
