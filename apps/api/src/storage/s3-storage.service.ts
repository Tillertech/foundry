import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { extname } from 'node:path';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StorageService, StoredFile } from './storage.service';

/** Production driver: files are stored in an S3 bucket. */
@Injectable()
export class S3StorageService extends StorageService {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly region: string;
  /** Base for public object URLs */
  private readonly publicBase: string;

  constructor(config: ConfigService) {
    super();
    this.region = config.get<string>('AWS_REGION') ?? 'us-east-1';
    this.bucket = config.get<string>('S3_BUCKET') ?? 'foundry-uploads';
    const endpoint = config.get<string>('S3_ENDPOINT');
    this.client = new S3Client({
      region: this.region,
      ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
    });
    //todo
    this.publicBase = endpoint
      ? `${endpoint.replace(/\/$/, '')}/${this.bucket}`
      : `https://${this.bucket}.s3.${this.region}.amazonaws.com`;
  }

  async upload(file: Express.Multer.File): Promise<StoredFile> {
    const key = `uploads/${randomUUID()}${extname(file.originalname)}`;
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      }),
    );
    return {
      key,
      url: `${this.publicBase}/${key}`,
      size: file.size,
      mimeType: file.mimetype,
      originalName: file.originalname,
    };
  }

  async put(key: string, content: Buffer, mimeType?: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: content,
        ...(mimeType && { ContentType: mimeType }),
      }),
    );
  }

  async putFile(key: string, path: string, mimeType?: string): Promise<void> {
    const { size } = await stat(path);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: createReadStream(path),
        ContentLength: size,
        ...(mimeType && { ContentType: mimeType }),
      }),
    );
  }

  async stream(key: string): Promise<Readable> {
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    if (!(result.Body instanceof Readable)) throw new Error(`No body for ${key}`);
    return result.Body;
  }

  async read(key: string): Promise<Buffer> {
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    const bytes = await result.Body?.transformToByteArray();
    return Buffer.from(bytes ?? []);
  }

  async remove(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }
}
