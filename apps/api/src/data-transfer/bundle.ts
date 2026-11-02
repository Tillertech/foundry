import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { createGunzip } from 'node:zlib';

/**
 * An account bundle: one owner and everything their workspaces hold, as
 * gzipped NDJSON. Every line is one JSON object:
 *
 *   {"kind":"manifest", ...}               always first
 *   {"kind":"row","table":"Client","data":{...}}   parents before children
 *   {"kind":"file","key":"...","seq":0,"data":"<base64>","last":true}
 *   {"kind":"end","rows":{...},"files":3,"bytes":1234}  always last
 *
 * Only Node built-ins are needed to read or write it, and both sides stream:
 * no account is ever held in memory whole. The format is the contract: keep
 * it readable by anything that follows this description.
 */
export const BUNDLE_FORMAT = 1;
export const BUNDLE_EXTENSION = '.foundry.ndjson.gz';
/** File bytes per line; keeps a line well under any reader's limits. */
export const FILE_CHUNK_BYTES = 256 * 1024;

export interface BundleManifest {
  kind: 'manifest';
  format: typeof BUNDLE_FORMAT;
  exportedAt: string;
  /** The last applied Prisma migration of the exporting install. */
  migration: string;
  owner: { id: string; email: string; name: string };
}

export interface BundleRow {
  kind: 'row';
  table: string;
  data: Record<string, unknown>;
}

export interface BundleFileChunk {
  kind: 'file';
  key: string;
  seq: number;
  /** base64 */
  data: string;
  last: boolean;
  mimeType?: string | null;
}

export interface BundleEnd {
  kind: 'end';
  /** Rows written per table; the importer checks them. */
  rows: Record<string, number>;
  files: number;
  bytes: number;
  /** Keys the rows point at whose files could not be read. */
  missing: string[];
}

export type BundleLine = BundleManifest | BundleRow | BundleFileChunk | BundleEnd;

export class BundleError extends Error {}

/** Reads a bundle from disk line by line, checking its framing as it goes. */
export async function* readBundle(path: string): AsyncGenerator<BundleLine> {
  const lines = createInterface({
    input: createReadStream(path).pipe(createGunzip()),
    crlfDelay: Infinity,
  });
  let n = 0;
  let ended = false;
  try {
    for await (const text of lines) {
      if (!text) continue;
      if (ended) throw new BundleError('Data after the end of the bundle');
      let line: BundleLine;
      try {
        line = JSON.parse(text) as BundleLine;
      } catch {
        throw new BundleError(`Line ${n + 1} is not JSON`);
      }
      if (n === 0 && line.kind !== 'manifest') {
        throw new BundleError('Not a Foundry account bundle (no manifest)');
      }
      if (n === 0 && (line as BundleManifest).format !== BUNDLE_FORMAT) {
        throw new BundleError(
          `Bundle format ${(line as BundleManifest).format} is not supported (expected ${BUNDLE_FORMAT})`,
        );
      }
      if (line.kind === 'end') ended = true;
      n++;
      yield line;
    }
  } catch (err) {
    if (err instanceof BundleError) throw err;
    throw new BundleError(`Unreadable bundle: ${(err as Error).message}`);
  }
  if (!ended) throw new BundleError('The bundle is truncated (no end marker)');
}
