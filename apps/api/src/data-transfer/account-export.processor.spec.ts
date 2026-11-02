import { NotFoundException } from '@nestjs/common';
import { createGunzip } from 'node:zlib';
import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { AccountExportProcessor } from './account-export.processor';
import { AccountExportsService } from './account-exports.service';
import { ExportJobs } from './account-export.queue';

const manifest = {
  kind: 'manifest' as const,
  format: 1 as const,
  exportedAt: '2026-11-01T10:00:00.000Z',
  migration: 'm1',
  owner: { id: 'u-1', email: 'a@studio.test', name: 'Ada' },
};

function exporter() {
  return {
    manifest: vi.fn().mockResolvedValue(manifest),
    lines: vi.fn(async function* () {
      yield `${JSON.stringify(manifest)}\n`;
      yield `${JSON.stringify({ kind: 'end', rows: {}, files: 0, bytes: 0, missing: [] })}\n`;
    }),
  };
}

function storage() {
  const stored: Record<string, string> = {};
  return {
    stored,
    putFile: vi.fn(async (key: string, path: string) => {
      // Read back what the processor wrote, so the test sees real gzip.
      const chunks: Buffer[] = [];
      for await (const c of createReadStream(path).pipe(createGunzip())) chunks.push(c as Buffer);
      stored[key] = Buffer.concat(chunks).toString();
    }),
    remove: vi.fn(async (key: string) => {
      delete stored[key];
    }),
    stream: vi.fn(async (key: string) => {
      if (!(key in stored)) throw new Error('ENOENT');
      return Readable.from([stored[key]]);
    }),
  };
}

const job = (patch: Record<string, unknown> = {}) => ({
  id: '42',
  name: ExportJobs.EXPORT,
  data: { ownerId: 'u-1' },
  opts: { attempts: 2 },
  attemptsMade: 0,
  timestamp: Date.parse('2026-11-01T10:00:00Z'),
  ...patch,
});

describe('AccountExportProcessor', () => {
  function setup() {
    const files = storage();
    const events = { emit: vi.fn() };
    const queue = { add: vi.fn() };
    const processor = new AccountExportProcessor(
      exporter() as never,
      files as never,
      events as never,
      queue as never,
    );
    return { processor, files, events, queue };
  }

  it('stores the bundle, schedules its removal and tells the owner', async () => {
    const { processor, files, events, queue } = setup();

    const result = await processor.process(job() as never);

    expect(result).toMatchObject({
      key: 'exports/u-1/42.foundry.ndjson.gz',
      fileName: 'foundry-account-2026-11-01.foundry.ndjson.gz',
    });
    expect(files.stored['exports/u-1/42.foundry.ndjson.gz']).toContain('"kind":"manifest"');
    expect(queue.add).toHaveBeenCalledWith(
      ExportJobs.EXPIRE,
      { key: 'exports/u-1/42.foundry.ndjson.gz' },
      expect.objectContaining({ delay: 7 * 24 * 60 * 60 * 1000 }),
    );
    expect(events.emit).toHaveBeenCalledWith(
      'account.export_finished',
      expect.objectContaining({ ownerId: 'u-1', exportId: '42', ok: true }),
    );
  });

  it('removes the bundle when the expire job runs', async () => {
    const { processor, files } = setup();
    files.stored['exports/u-1/42.foundry.ndjson.gz'] = 'x';
    await processor.process(
      job({ name: ExportJobs.EXPIRE, data: { key: 'exports/u-1/42.foundry.ndjson.gz' } }) as never,
    );
    expect(files.stored).toEqual({});
  });

  it('notifies a failure only once the retries are used up', () => {
    const { processor, events } = setup();
    processor.onFailed(job({ attemptsMade: 1 }) as never, new Error('db down'));
    expect(events.emit).not.toHaveBeenCalled();
    processor.onFailed(job({ attemptsMade: 2 }) as never, new Error('db down'));
    expect(events.emit).toHaveBeenCalledWith('account.export_finished', {
      ownerId: 'u-1',
      exportId: '42',
      ok: false,
    });
  });
});

describe('AccountExportsService', () => {
  const ready = {
    key: 'exports/u-1/42.foundry.ndjson.gz',
    fileName: 'f.foundry.ndjson.gz',
    bytes: 10,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  };

  function setup(state = 'completed', returnvalue: unknown = ready) {
    const stored = job({ returnvalue });
    const jobApi = {
      ...stored,
      getState: vi.fn().mockResolvedValue(state),
      isCompleted: vi.fn().mockResolvedValue(state === 'completed'),
      isFailed: vi.fn().mockResolvedValue(state === 'failed'),
    };
    const queue = {
      getDeduplicationJobId: vi.fn().mockResolvedValue(null),
      getJob: vi.fn(async (id: string) => (id === '42' ? jobApi : undefined)),
      add: vi.fn(async () => ({ ...jobApi, getState: vi.fn().mockResolvedValue('waiting') })),
    };
    const files = storage();
    files.stored[ready.key] = 'bundle';
    return { service: new AccountExportsService(queue as never, files as never), queue };
  }

  it('queues one export per owner at a time', async () => {
    const { service, queue } = setup('active');
    queue.getDeduplicationJobId.mockResolvedValue('42');

    await expect(service.request('u-1')).resolves.toMatchObject({ id: '42', state: 'running' });
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('queues a new export with retries and deduplication', async () => {
    const { service, queue } = setup();
    await expect(service.request('u-1')).resolves.toMatchObject({ state: 'queued' });
    expect(queue.add).toHaveBeenCalledWith(
      ExportJobs.EXPORT,
      { ownerId: 'u-1' },
      expect.objectContaining({ attempts: 2, deduplication: { id: 'account-export:u-1' } }),
    );
  });

  it('reports a finished export as ready, with its size and expiry', async () => {
    const { service } = setup();
    await expect(service.status('u-1', '42')).resolves.toMatchObject({
      state: 'ready',
      bytes: 10,
      fileName: 'f.foundry.ndjson.gz',
    });
  });

  it("never shows or serves another owner's export", async () => {
    const { service } = setup();
    await expect(service.status('u-2', '42')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.download('u-2', '42')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('streams a ready bundle and refuses an expired one', async () => {
    const { service } = setup();
    const { stream, fileName } = await service.download('u-1', '42');
    expect(fileName).toBe('f.foundry.ndjson.gz');
    let body = '';
    for await (const c of stream) body += c;
    expect(body).toBe('bundle');

    const expired = setup('completed', { ...ready, expiresAt: '2000-01-01T00:00:00Z' });
    await expect(expired.service.status('u-1', '42')).resolves.toMatchObject({ state: 'expired' });
    await expect(expired.service.download('u-1', '42')).rejects.toBeInstanceOf(NotFoundException);
  });
});
