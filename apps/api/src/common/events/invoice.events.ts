export enum InvoiceEvents {
  SENT = 'invoice.sent',
}

export class InvoiceSentEvent {
  constructor(public readonly invoiceId: string) {}
}
