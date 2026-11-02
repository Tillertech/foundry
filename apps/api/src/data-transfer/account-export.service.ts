import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { EXPORT_ORDER, delegateName } from './account-registry';
import {
  BUNDLE_FORMAT,
  FILE_CHUNK_BYTES,
  type BundleEnd,
  type BundleFileChunk,
  type BundleLine,
  type BundleManifest,
} from './bundle';

const BATCH = 500;

type Delegate = {
  findMany(args: {
    where: Record<string, unknown>;
    orderBy: { id: 'asc' };
    take: number;
    skip?: number;
    cursor?: { id: string };
  }): Promise<Record<string, unknown>[]>;
};

@Injectable()
export class AccountExportService {
  private readonly logger = new Logger(AccountExportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async manifest(ownerId: string): Promise<BundleManifest> {
    const owner = await this.prisma.user.findUnique({
      where: { id: ownerId },
      select: { id: true, email: true, name: true },
    });
    if (!owner) throw new NotFoundException('No such account');
    return {
      kind: 'manifest',
      format: BUNDLE_FORMAT,
      exportedAt: new Date().toISOString(),
      migration: await lastMigration(this.prisma),
      owner,
    };
  }

  async *lines(manifest: BundleManifest): AsyncGenerator<string> {
    const ownerId = manifest.owner.id;
    yield encode(manifest);
    const rows: Record<string, number> = {};
    const keys = new Set<string>();
    for (const [model, rule] of EXPORT_ORDER) {
      const delegate = (this.prisma as unknown as Record<string, Delegate>)[
        delegateName(model)
      ];
      const where = rule.owned(ownerId);
      let cursor: string | undefined;
      rows[model] = 0;
      for (;;) {
        const batch = await delegate.findMany({
          where,
          orderBy: { id: 'asc' },
          take: BATCH,
          ...(cursor && { skip: 1, cursor: { id: cursor } }),
        });
        for (const data of batch) {
          for (const key of rule.files?.(data) ?? []) if (key) keys.add(key);
          yield encode({ kind: 'row', table: model, data });
        }
        rows[model] += batch.length;
        if (batch.length < BATCH) break;
        cursor = batch[batch.length - 1]['id'] as string;
      }
    }

    let bytes = 0;
    let files = 0;
    const missing: string[] = [];
    for (const key of keys) {
      let content: Buffer;
      try {
        content = await this.storage.read(key);
      } catch (err) {
        this.logger.warn(
          `Export of ${ownerId}: file ${key} unreadable: ${(err as Error).message}`,
        );
        missing.push(key);
        continue;
      }
      files++;
      bytes += content.length;
      const chunks = Math.max(1, Math.ceil(content.length / FILE_CHUNK_BYTES));
      for (let seq = 0; seq < chunks; seq++) {
        yield encode({
          kind: 'file',
          key,
          seq,
          data: content
            .subarray(seq * FILE_CHUNK_BYTES, (seq + 1) * FILE_CHUNK_BYTES)
            .toString('base64'),
          last: seq === chunks - 1,
        } satisfies BundleFileChunk);
      }
    }
    yield encode({
      kind: 'end',
      rows,
      files,
      bytes,
      missing,
    } satisfies BundleEnd);
  }
}

const encode = (line: BundleLine): string => `${JSON.stringify(line)}\n`;

/** The newest finished migration; bundles only import where it has run too. */
export async function lastMigration(prisma: PrismaService): Promise<string> {
  const rows = await prisma.$queryRaw<{ migration_name: string }[]>`
    SELECT migration_name FROM _prisma_migrations
    WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
    ORDER BY migration_name DESC LIMIT 1`;
  return rows[0]?.migration_name ?? '';
}
