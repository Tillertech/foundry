export interface StoredFile {
  /** Storage key: relative file path locally, object key on S3. */
  key: string;
  /** Publicly reachable URL for the stored file. */
  url: string;
  size: number;
  mimeType: string;
  originalName: string;
}

export abstract class StorageService {
  abstract upload(file: Express.Multer.File): Promise<StoredFile>;
  abstract remove(key: string): Promise<void>;
}
