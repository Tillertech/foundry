import type { StoredFile } from '../../storage/storage.service';

export const FileEvents = {
  UPLOADED: 'file.uploaded',
} as const;

export type FileUploadedEvent = StoredFile;
