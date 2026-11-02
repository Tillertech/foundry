import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, NotFoundException } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';
import type { Readable } from 'node:stream';
import { StorageService } from '../storage/storage.service';
import {
  ACCOUNT_EXPORT_QUEUE,
  EXPORT_ATTEMPTS,
  ExportJobs,
  exportTtlMs,
  type ExportJobData,
  type ExportJobResult,
} from './account-export.queue';

export type ExportState = 'queued' | 'running' | 'ready' | 'failed' | 'expired';

/** One export, as the owner sees it. */
export interface AccountExportStatus {
  id: string;
  state: ExportState;
  requestedAt: string;
  /** When ready. */
  fileName?: string;
  bytes?: number;
  expiresAt?: string;
}

/**
 * Requests, tracks and serves an owner's background exports. Jobs are the
 * record: no table is needed, and a finished job is kept exactly as long as
 * its bundle (ACCOUNT_EXPORT_TTL_DAYS). An owner only ever sees their own.
 */
@Injectable()
export class AccountExportsService {
  constructor(
    @InjectQueue(ACCOUNT_EXPORT_QUEUE) private readonly queue: Queue,
    private readonly storage: StorageService,
  ) {}

  /** Queues an export, or returns the one already queued or running. */
  async request(ownerId: string): Promise<AccountExportStatus> {
    const pending = await this.queue.getDeduplicationJobId(dedupeId(ownerId));
    if (pending) {
      const job = await this.queue.getJob(pending);
      if (job && !(await job.isCompleted()) && !(await job.isFailed())) {
        return this.toStatus(job);
      }
    }
    const ttlSeconds = Math.ceil(exportTtlMs() / 1000);
    const job = await this.queue.add(
      ExportJobs.EXPORT,
      { ownerId } satisfies ExportJobData,
      {
        deduplication: { id: dedupeId(ownerId) },
        attempts: EXPORT_ATTEMPTS,
        backoff: { type: 'exponential', delay: 30_000 },
        removeOnComplete: { age: ttlSeconds },
        removeOnFail: { age: ttlSeconds },
      },
    );
    return this.toStatus(job);
  }

  async status(ownerId: string, id: string): Promise<AccountExportStatus> {
    return this.toStatus(await this.find(ownerId, id));
  }

  /** The stored bundle, streamed. 404 once it has expired. */
  async download(ownerId: string, id: string): Promise<{ stream: Readable; fileName: string }> {
    const job = await this.find(ownerId, id);
    const result = job.returnvalue as ExportJobResult | null;
    if (!result || !(await job.isCompleted()) || isExpired(result)) {
      throw new NotFoundException('This export is not ready or has expired');
    }
    try {
      return { stream: await this.storage.stream(result.key), fileName: result.fileName };
    } catch {
      throw new NotFoundException('This export has expired');
    }
  }

  private async find(ownerId: string, id: string): Promise<Job> {
    const job = await this.queue.getJob(id);
    if (!job || job.name !== ExportJobs.EXPORT || (job.data as ExportJobData).ownerId !== ownerId) {
      throw new NotFoundException('No such export');
    }
    return job;
  }

  private async toStatus(job: Job): Promise<AccountExportStatus> {
    const base = { id: String(job.id), requestedAt: new Date(job.timestamp).toISOString() };
    const state = await job.getState();
    if (state === 'completed') {
      const result = job.returnvalue as ExportJobResult;
      return isExpired(result)
        ? { ...base, state: 'expired' }
        : { ...base, state: 'ready', fileName: result.fileName, bytes: result.bytes, expiresAt: result.expiresAt };
    }
    if (state === 'failed') return { ...base, state: 'failed' };
    return { ...base, state: state === 'active' ? 'running' : 'queued' };
  }
}

const dedupeId = (ownerId: string) => `account-export:${ownerId}`;
const isExpired = (r: ExportJobResult) => new Date(r.expiresAt).getTime() <= Date.now();
