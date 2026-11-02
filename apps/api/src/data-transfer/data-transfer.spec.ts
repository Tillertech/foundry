import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { AccountExportService } from './account-export.service';
import { ACCOUNT_TABLES, EXPORT_ORDER, delegateName, isExported } from './account-registry';
import { BUNDLE_FORMAT, FILE_CHUNK_BYTES, readBundle, type BundleLine } from './bundle';

/**
 * An in-memory database that evaluates the relation `where` shapes the
 * registry builds, so the leak test checks real filtering - not the shape of
 * a query.
 */
type Row = Record<string, unknown>;
const RELATIONS: Record<string, Record<string, [model: string, fk: string]>> = {
  Notification: { user: ['User', 'userId'] },
  Client: { workspace: ['Workspace', 'workspaceId'] },
  Project: { client: ['Client', 'clientId'] },
  Milestone: { project: ['Project', 'projectId'] },
  Expense: { workspace: ['Workspace', 'workspaceId'], project: ['Project', 'projectId'] },
  Invoice: { workspace: ['Workspace', 'workspaceId'], client: ['Client', 'clientId'] },
  InvoiceItem: { invoice: ['Invoice', 'invoiceId'] },
  Quote: { client: ['Client', 'clientId'] },
  QuoteItem: { quote: ['Quote', 'quoteId'] },
  Payment: { client: ['Client', 'clientId'] },
  ReconciliationEntry: {
    invoice: ['Invoice', 'invoiceId'],
    project: ['Project', 'projectId'],
    payment: ['Payment', 'paymentId'],
  },
  Document: {
    workspace: ['Workspace', 'workspaceId'],
    client: ['Client', 'clientId'],
    project: ['Project', 'projectId'],
  },
  ClientPortal: { client: ['Client', 'clientId'] },
  PortalPermission: { clientPortal: ['ClientPortal', 'clientPortalId'] },
  ClientPortalUser: { clientPortal: ['ClientPortal', 'clientPortalId'] },
  ClientPortalProject: { clientPortal: ['ClientPortal', 'clientPortalId'] },
  ClientPortalUserProject: { clientPortalUser: ['ClientPortalUser', 'clientPortalUserId'] },
};

function fakeDb(tables: Record<string, Row[]>, migrations = ['20260101000000_init']) {
  const matches = (model: string, row: Row | undefined, where: Row): boolean => {
    if (!row) return false;
    return Object.entries(where).every(([key, cond]) => {
      if (key === 'OR') return (cond as Row[]).some((w) => matches(model, row, w));
      const relation = RELATIONS[model]?.[key];
      if (relation) {
        const [target, fk] = relation;
        const parent = tables[target]?.find((r) => r['id'] === row[fk]);
        return matches(target, parent, cond as Row);
      }
      if (cond && typeof cond === 'object' && 'in' in (cond as Row)) {
        return ((cond as { in: unknown[] }).in).includes(row[key]);
      }
      return row[key] === cond;
    });
  };
  const delegate = (model: string) => ({
    findMany: vi.fn(async (args: { where: Row; take?: number; skip?: number; cursor?: { id: string } }) => {
      let rows = (tables[model] ?? [])
        .filter((r) => matches(model, r, args.where))
        .sort((a, b) => String(a['id']).localeCompare(String(b['id'])));
      if (args.cursor) rows = rows.slice(rows.findIndex((r) => r['id'] === args.cursor?.id) + (args.skip ?? 0));
      return args.take ? rows.slice(0, args.take) : rows;
    }),
    findUnique: vi.fn(async ({ where }: { where: Row }) => tables[model]?.find((r) => r['id'] === where['id']) ?? null),
    createMany: vi.fn(async ({ data }: { data: Row[] }) => {
      (tables[model] ??= []).push(...data);
      return { count: data.length };
    }),
  });
  const prisma: Record<string, unknown> = {
    $queryRaw: vi.fn(async () => migrations.map((migration_name) => ({ migration_name }))),
  };
  for (const model of Object.keys(ACCOUNT_TABLES)) prisma[delegateName(model)] = delegate(model);
  prisma['$transaction'] = vi.fn(async (fn: (tx: unknown) => unknown) => fn(prisma));
  return prisma;
}

/** One row in every table for an account, keys prefixed so leaks are obvious. */
function account(p: string): Record<string, Row[]> {
  const id = (t: string) => `${p}-${t}`;
  return {
    User: [{ id: id('user'), email: `${p}@studio.test`, name: p }],
    Notification: [{ id: id('note'), userId: id('user') }],
    Workspace: [{ id: id('ws'), ownerId: id('user'), storageKey: `${p}-logo.png` }],
    Client: [{ id: id('client'), workspaceId: id('ws') }],
    Project: [{ id: id('project'), clientId: id('client') }],
    Milestone: [{ id: id('milestone'), projectId: id('project') }],
    Expense: [
      { id: id('expense'), workspaceId: id('ws'), projectId: null },
      // Older row: no workspace, reached through its project.
      { id: id('expense-legacy'), workspaceId: null, projectId: id('project') },
    ],
    Invoice: [{ id: id('invoice'), workspaceId: id('ws'), clientId: id('client') }],
    InvoiceItem: [{ id: id('item'), invoiceId: id('invoice') }],
    Quote: [{ id: id('quote'), clientId: id('client'), number: `Q-${p}` }],
    QuoteItem: [{ id: id('qitem'), quoteId: id('quote') }],
    Payment: [{ id: id('payment'), clientId: id('client') }],
    ReconciliationEntry: [{ id: id('recon'), paymentId: id('payment'), invoiceId: null, projectId: null }],
    Document: [{ id: id('doc'), workspaceId: id('ws'), clientId: null, projectId: null, storageKey: `${p}-doc.pdf` }],
    ClientPortal: [{ id: id('portal'), clientId: id('client'), slug: `${p}-portal` }],
    PortalPermission: [{ id: id('perm'), clientPortalId: id('portal') }],
    ClientPortalUser: [{ id: id('puser'), clientPortalId: id('portal') }],
    ClientPortalProject: [{ id: id('pproject'), clientPortalId: id('portal'), projectId: id('project') }],
    ClientPortalUserProject: [{ id: id('puproject'), clientPortalUserId: id('puser'), projectId: id('project') }],
  };
}

const merge = (...accounts: Record<string, Row[]>[]) => {
  const out: Record<string, Row[]> = {};
  for (const a of accounts) for (const [t, rows] of Object.entries(a)) (out[t] ??= []).push(...rows.map((r) => ({ ...r })));
  return out;
};

function storage(files: Record<string, Buffer> = {}) {
  return {
    read: vi.fn(async (key: string) => {
      if (!files[key]) throw new Error('ENOENT');
      return files[key];
    }),
    put: vi.fn(async (key: string, content: Buffer) => {
      files[key] = content;
    }),
    remove: vi.fn(async (key: string) => {
      delete files[key];
    }),
  };
}

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'foundry-bundle-'));
});
afterAll(() => rm(dir, { recursive: true, force: true }));

async function exportTo(db: unknown, files: ReturnType<typeof storage>, ownerId: string, name: string) {
  const exporter = new AccountExportService(db as never, files as never);
  let text = '';
  for await (const line of exporter.lines(await exporter.manifest(ownerId))) text += line;
  const path = join(dir, name);
  await writeFile(path, gzipSync(text));
  return path;
}

async function linesOf(path: string): Promise<BundleLine[]> {
  const out: BundleLine[] = [];
  for await (const line of readBundle(path)) out.push(line);
  return out;
}

const bigFile = Buffer.alloc(FILE_CHUNK_BYTES * 2 + 10, 7);
const sourceFiles = () => ({
  'a-logo.png': Buffer.from('logo-a'),
  'a-doc.pdf': bigFile,
  'b-logo.png': Buffer.from('logo-b'),
  'b-doc.pdf': Buffer.from('doc-b'),
});

describe('account registry', () => {
  it('classifies every exported table with an order and an ownership path', () => {
    for (const [model, rule] of Object.entries(ACCOUNT_TABLES)) {
      expect(isExported(rule), model).toBe(true);
    }
    const orders = EXPORT_ORDER.map(([, r]) => r.order);
    expect(new Set(orders).size).toBe(orders.length);
  });

  it('inserts every parent before its children', () => {
    const order = Object.fromEntries(EXPORT_ORDER.map(([m, r]) => [m, r.order]));
    for (const [model, relations] of Object.entries(RELATIONS)) {
      for (const [parent] of Object.values(relations)) {
        expect(order[parent], `${parent} before ${model}`).toBeLessThan(order[model]);
      }
    }
  });
});

describe('account export', () => {
  it("contains every row and file of the owner and nothing of anyone else's", async () => {
    const db = fakeDb(merge(account('a'), account('b')));
    const path = await exportTo(db, storage(sourceFiles()), 'a-user', 'a.gz');
    const lines = await linesOf(path);

    const text = JSON.stringify(lines);
    expect(text).not.toMatch(/"b-[a-z-]+"/);
    const rows = lines.filter((l) => l.kind === 'row');
    expect(rows).toHaveLength(Object.values(account('a')).flat().length);

    const end = lines.at(-1);
    expect(end).toMatchObject({ kind: 'end', files: 2, missing: [] });
    // Big files are split into chunks, in order.
    const chunks = lines.filter((l) => l.kind === 'file' && l.key === 'a-doc.pdf');
    expect(chunks).toHaveLength(3);
    expect(lines[0]).toMatchObject({ kind: 'manifest', format: BUNDLE_FORMAT, owner: { id: 'a-user' } });
  });

  it('lists files it could not read instead of failing', async () => {
    const files = sourceFiles() as Record<string, Buffer>;
    delete files['a-doc.pdf'];
    const path = await exportTo(fakeDb(account('a')), storage(files), 'a-user', 'missing.gz');
    expect((await linesOf(path)).at(-1)).toMatchObject({ files: 1, missing: ['a-doc.pdf'] });
  });
});
