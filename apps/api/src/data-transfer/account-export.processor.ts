import { OnWorkerEvent, Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Job, Queue } from 'bullmq';
import { createWriteStream } from 'node:fs';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';
import {
  AccountExportEvents,
  type AccountExportFinishedEvent,
} from '../common/events/workspace.events';
import { StorageService } from '../storage/storage.service';
import { AccountExportService } from './account-export.service';
import {
  ACCOUNT_EXPORT_QUEUE,
  EXPORT_ATTEMPTS,
  ExportJobs,
  exportTtlMs,
  type ExpireJobData,
  type ExportJobData,
  type ExportJobResult,
} from './account-export.queue';
import { BUNDLE_EXTENSION } from './bundle';


@Processor(ACCOUNT_EXPORT_QUEUE, { concurrency: 1 })
export class AccountExportProcessor extends WorkerHost {
  private readonly logger = new Logger(AccountExportProcessor.name);

  constructor(
    private readonly exporter: AccountExportService,
    private readonly storage: StorageService,
    private readonly events: EventEmitter2,
    @InjectQueue(ACCOUNT_EXPORT_QUEUE) private readonly queue: Queue,
  ) {
    super();
  }

  async process(job: Job): Promise<ExportJobResult | void> {
    if (job.name === ExportJobs.EXPIRE) {
      await this.storage.remove((job.data as ExpireJobData).key);
      return;
    }
    return this.export(job as Job<ExportJobData>);
  }

  private async export(job: Job<ExportJobData>): Promise<ExportJobResult> {
    const { ownerId } = job.data;
    const manifest = await this.exporter.manifest(ownerId);
    const fileName = `foundry-account-${manifest.exportedAt.slice(0, 10)}${BUNDLE_EXTENSION}`;
    const key = `exports/${ownerId}/${job.id}${BUNDLE_EXTENSION}`;
    const dir = await mkdtemp(join(tmpdir(), 'foundry-export-'));
    const path = join(dir, fileName);
    try {
      await pipeline(
        Readable.from(this.exporter.lines(manifest)),
        createGzip(),
        createWriteStream(path),
      );
      const { size } = await stat(path);
      await this.storage.putFile(key, path, 'application/gzip');

      const ttl = exportTtlMs();
      await this.queue.add(
        ExportJobs.EXPIRE,
        { key } satisfies ExpireJobData,
        { delay: ttl, removeOnComplete: true, removeOnFail: 100 },
      );
      const result: ExportJobResult = {
        key,
        fileName,
        bytes: size,
        expiresAt: new Date(Date.now() + ttl).toISOString(),
      };
      this.events.emit(AccountExportEvents.FINISHED, {
        ownerId,
        exportId: String(job.id),
        ok: true,
        bytes: size,
        expiresAt: result.expiresAt,
      } satisfies AccountExportFinishedEvent);
      this.logger.log(`Exported account ${ownerId} (${size} bytes)`);
      return result;
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  /** Tell the owner once retries are used up, not on every attempt. */
  @OnWorkerEvent('failed')
  onFailed(job: Job | undefined, err: Error): void {
    if (!job || job.name !== ExportJobs.EXPORT) return;
    this.logger.error(`Account export ${job.id} failed: ${err.message}`);
    if (job.attemptsMade < (job.opts.attempts ?? EXPORT_ATTEMPTS)) return;
    this.events.emit(AccountExportEvents.FINISHED, {
      ownerId: (job.data as ExportJobData).ownerId,
      exportId: String(job.id),
      ok: false,
    } satisfies AccountExportFinishedEvent);
  }
}
