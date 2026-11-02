import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import type { Readable } from 'node:stream';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StorageService, StoredFile } from './storage.service';

/** Development driver: files land in ./uploads and are served by ServeStaticModule. */
@Injectable()
export class LocalStorageService extends StorageService {
  private readonly logger = new Logger(LocalStorageService.name);
  private readonly root: string;
  private readonly baseUrl: string;

  constructor(config: ConfigService) {
    super();
    this.root =
      config.get<string>('UPLOADS_DIR') ?? join(process.cwd(), 'uploads');
    this.baseUrl = config.get<string>('PUBLIC_URL') ?? 'http://localhost:3000';
  }

  async upload(file: Express.Multer.File): Promise<StoredFile> {
    await mkdir(this.root, { recursive: true });
    const key = `${randomUUID()}${extname(file.originalname)}`;
    await writeFile(join(this.root, key), file.buffer);
    this.logger.debug(`Stored ${file.originalname} as ${key}`);
    return {
      key,
      url: `${this.baseUrl}/uploads/${key}`,
      size: file.size,
      mimeType: file.mimetype,
      originalName: file.originalname,
    };
  }

  async put(key: string, content: Buffer): Promise<void> {
    const path = this.inside(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content);
  }

  async putFile(key: string, source: string): Promise<void> {
    const path = this.inside(key);
    await mkdir(dirname(path), { recursive: true });
    await copyFile(source, path);
  }

  async stream(key: string): Promise<Readable> {
    const path = this.inside(key);
    await stat(path);
    return createReadStream(path);
  }

  /** The absolute path for a key, refusing any key that escapes the root. */
  private inside(key: string): string {
    const path = resolve(this.root, key);
    const rel = relative(resolve(this.root), path);
    if (!rel || rel.startsWith('..') || resolve(rel) === rel) {
      throw new Error(`Refusing a path outside the uploads directory: ${key}`);
    }
    return path;
  }

  read(key: string): Promise<Buffer> {
    return readFile(join(this.root, key));
  }

  async remove(key: string): Promise<void> {
    await unlink(join(this.root, key)).catch(() => undefined);
  }
}
