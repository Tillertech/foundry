/** BullMQ queue for account exports (account-export.processor.ts). */
export const ACCOUNT_EXPORT_QUEUE = 'account-export';

export const ExportJobs = {
  /** Build the bundle and store it. */
  EXPORT: 'export',
  /** Remove a stored bundle once its download window closes. */
  EXPIRE: 'expire',
} as const;

export interface ExportJobData {
  ownerId: string;
}

export interface ExpireJobData {
  key: string;
}

/** What a finished export job returns (job.returnvalue). */
export interface ExportJobResult {
  key: string;
  fileName: string;
  bytes: number;
  expiresAt: string;
}

/** How long a finished bundle stays downloadable (ACCOUNT_EXPORT_TTL_DAYS). */
export const exportTtlMs = (): number =>
  (Number(process.env['ACCOUNT_EXPORT_TTL_DAYS']) || 7) * 24 * 60 * 60 * 1000;

export const EXPORT_ATTEMPTS = 2;
