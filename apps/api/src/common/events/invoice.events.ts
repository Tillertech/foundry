import type {
  ClientModel as Client,
  InvoiceModel as Invoice,
  InvoiceItemModel as InvoiceItem,
} from '../../generated/prisma/models';

export const InvoiceEvents = {
  SENT: 'invoice.sent',
} as const;

export interface InvoiceSentEvent {
  invoice: Invoice & { items: InvoiceItem[] };
  client: Client;
}
