import { PaginationQuery } from '../../core/http/api.types';

export type NotificationKind =
  | 'invoice_sent'
  | 'invoice_paid'
  | 'invoice_reminder'
  | 'quote_sent'
  | 'document_shared';

/** In-app notification shown behind the header bell. */
export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  /** Id of the invoice, quote or document the notification is about. */
  resourceId: string | null;
  readAt: string | null;
  userId: string;
  createdAt: string;
}

export interface ListNotificationsQuery extends PaginationQuery {
  unread?: boolean;
}

export interface UnreadCount {
  count: number;
}
