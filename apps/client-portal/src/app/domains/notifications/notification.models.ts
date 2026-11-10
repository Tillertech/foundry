import { PaginationQuery } from '@foundry/shared-util';

export type PortalNotificationKind =
  | 'quote_sent'
  | 'invoice_sent'
  | 'document_shared'
  | 'milestone_started'
  | 'milestone_delivered'
  | 'milestone_accepted';

export interface PortalNotification {
  id: string;
  kind: PortalNotificationKind;
  title: string;
  body: string;
  /** Quote, invoice or document id; the project id for milestone news. */
  resourceId: string | null;
  readAt: string | null;
  clientPortalUserId: string;
  createdAt: string;
}

export interface ListPortalNotificationsQuery extends PaginationQuery {
  unread?: boolean;
}
