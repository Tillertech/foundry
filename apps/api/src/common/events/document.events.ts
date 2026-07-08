import type {
  ClientModel as Client,
  DocumentModel as Document,
} from '../../generated/prisma/models';

export const DocumentEvents = {
  SHARED: 'document.shared',
} as const;

/** Emitted when the owner shares a stored document with its client by email. */
export interface DocumentSharedEvent {
  document: Document;
  client: Client;
}
