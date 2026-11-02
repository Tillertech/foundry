import type { Readable } from 'node:stream';

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
  /** Contents of a stored file, for downloads and mail attachments. */
  abstract read(key: string): Promise<Buffer>;
  abstract remove(key: string): Promise<void>;
  /**
   * Writes content under a key chosen by the caller (account import keeps
   * every file's original key). Callers must check the key is safe and unused.
   */
  abstract put(key: string, content: Buffer, mimeType?: string): Promise<void>;
  /** Like put, streaming from a file on disk: for content too big to buffer. */
  abstract putFile(key: string, path: string, mimeType?: string): Promise<void>;
  /** Streams a stored file, for downloads too big to buffer. */
  abstract stream(key: string): Promise<Readable>;
}
