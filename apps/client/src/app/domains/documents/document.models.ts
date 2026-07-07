import { PaginationQuery } from '../../core/http/api.types';

export type DocumentType = 'contract' | 'nda' | 'receipt' | 'report' | 'other';

export interface ApiDocument {
  id: string;
  name: string;
  type: DocumentType;
  storageKey: string;
  size: number;
  mimeType: string | null;
  notes: string | null;
  clientId: string | null;
  projectId: string | null;
  uploadedAt: string;
}

/** Metadata sent alongside the binary `file` part; name defaults to the file name. */
export interface CreateDocumentRequest {
  name?: string;
  type?: DocumentType;
  notes?: string;
  clientId?: string;
  projectId?: string;
}

export type UpdateDocumentRequest = Partial<CreateDocumentRequest>;

export interface ListDocumentsQuery extends PaginationQuery {
  clientId?: string;
  projectId?: string;
  type?: DocumentType;
}
