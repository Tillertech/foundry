export type DocumentType = 'contract' | 'nda' | 'receipt' | 'report' | 'other';

export interface DocumentItem {
  id: string;
  name: string;
  type: DocumentType;
  mimeType: string | null;
  size: number;
  uploadedAt: string;
  projectId: string | null;
  notes: string | null;
}
