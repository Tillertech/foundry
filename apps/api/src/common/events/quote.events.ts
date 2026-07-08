import type {
  ClientModel as Client,
  QuoteModel as Quote,
  QuoteItemModel as QuoteItem,
} from '../../generated/prisma/models';

export const QuoteEvents = {
  SENT: 'quote.sent',
} as const;

export interface QuoteSentEvent {
  quote: Quote & { items: QuoteItem[] };
  client: Client;
}
