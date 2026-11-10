import type { QuoteStatus } from '../../generated/prisma/enums';
import type {
  ClientModel as Client,
  QuoteModel as Quote,
  QuoteItemModel as QuoteItem,
} from '../../generated/prisma/models';

export const QuoteEvents = {
  SENT: 'quote.sent',
  /** QuoteChangedEvent - any create/edit/delete/convert/response, for live views. */
  CHANGED: 'quote.changed',
  /** QuoteRespondedEvent - the client accepted or declined in the portal. */
  RESPONDED: 'quote.responded',
} as const;

export interface QuoteChangedEvent {
  quoteId: string;
  clientId: string;
  status: QuoteStatus;
  /** Status before this change (omitted on create / when unchanged). */
  previousStatus?: QuoteStatus;
  removed?: boolean;
}

export interface QuoteRespondedEvent {
  quote: Quote & { items: QuoteItem[] };
  client: Client;
  accepted: boolean;
  /** "Name <email>" of the portal user who answered. */
  respondedBy: string;
  note: string | null;
}

export interface QuoteSentEvent {
  quote: Quote & { items: QuoteItem[] };
  client: Client;
}
