import type { Prisma } from '../generated/prisma/client';

/**
 * Every table in the schema, classified for account export and import.
 *
 * Typed as Record<Prisma.ModelName, ...>: adding a model to schema.prisma
 * fails the build until it is classified here, so an export can never
 * silently leave a table behind. `owned` must reach the row only through the
 * owner's chain (user - workspace - ...); account-registry.spec checks that
 * no other account's rows come along.
 */
export interface ExportedTable {
  /** Parents before children: the importer inserts in this order. */
  order: number;
  /** Rows of this table that belong to the owner. */
  owned: (ownerId: string) => Record<string, unknown>;
  /** Stored files this row points at (copied with the same key). */
  files?: (row: Record<string, unknown>) => (string | null | undefined)[];
  /**
   * Columns unique across the whole database (besides `id`). On a shared
   * install another account may already hold the value, so the importer
   * reports them before it writes anything.
   */
  globallyUnique?: string[];
}

export interface SkippedTable {
  skip: string;
}

export type TableRule = ExportedTable | SkippedTable;

const workspace = (ownerId: string) => ({ ownerId });
const client = (ownerId: string) => ({ workspace: workspace(ownerId) });
const project = (ownerId: string) => ({ client: client(ownerId) });
const portal = (ownerId: string) => ({ client: client(ownerId) });

export const ACCOUNT_TABLES: Record<Prisma.ModelName, TableRule> = {
  User: { order: 0, owned: (id) => ({ id }), globallyUnique: ['email'] },
  Notification: { order: 1, owned: (id) => ({ userId: id }) },
  // A storage key already in use belongs to someone else's file: importing
  // it would overwrite that file, so keys count as unique too.
  Workspace: {
    order: 2,
    owned: workspace,
    files: (w) => [w['storageKey'] as string | null],
    globallyUnique: ['storageKey'],
  },
  Client: { order: 3, owned: client },
  Project: { order: 4, owned: project },
  Milestone: { order: 5, owned: (id) => ({ project: project(id) }) },
  // workspaceId is optional: older rows are reached through their project.
  Expense: {
    order: 6,
    owned: (id) => ({
      OR: [{ workspace: workspace(id) }, { project: project(id) }],
    }),
  },
  Invoice: { order: 7, owned: (id) => ({ workspace: workspace(id) }) },
  InvoiceItem: {
    order: 8,
    owned: (id) => ({ invoice: { workspace: workspace(id) } }),
  },
  // Quote numbers are unique across the install, not per workspace.
  Quote: {
    order: 9,
    owned: (id) => ({ client: client(id) }),
    globallyUnique: ['number'],
  },
  QuoteItem: { order: 10, owned: (id) => ({ quote: { client: client(id) } }) },
  Payment: { order: 11, owned: (id) => ({ client: client(id) }) },
  // Each link is optional; any one of them proves ownership.
  ReconciliationEntry: {
    order: 12,
    owned: (id) => ({
      OR: [
        { invoice: { workspace: workspace(id) } },
        { project: project(id) },
        { payment: { client: client(id) } },
      ],
    }),
  },
  Document: {
    order: 13,
    owned: (id) => ({
      OR: [
        { workspace: workspace(id) },
        { client: client(id) },
        { project: project(id) },
      ],
    }),
    files: (d) => [d['storageKey'] as string],
    globallyUnique: ['storageKey'],
  },
  // Portal slugs are public URLs and unique across the install.
  ClientPortal: { order: 14, owned: portal, globallyUnique: ['slug'] },
  PortalPermission: {
    order: 15,
    owned: (id) => ({ clientPortal: portal(id) }),
  },
  ClientPortalUser: {
    order: 16,
    owned: (id) => ({ clientPortal: portal(id) }),
  },
  ClientPortalProject: {
    order: 17,
    owned: (id) => ({ clientPortal: portal(id) }),
  },
  ClientPortalUserProject: {
    order: 18,
    owned: (id) => ({ clientPortalUser: { clientPortal: portal(id) } }),
  },
  PortalNotification: {
    order: 19,
    owned: (id) => ({ clientPortalUser: { clientPortal: portal(id) } }),
  },
  // After ClientPortalUser (optional reviewer link) and Milestone.
  MilestoneReview: {
    order: 20,
    owned: (id) => ({ milestone: { project: project(id) } }),
  },
  // After Quote and Document, the two rows it joins.
  QuoteAttachment: {
    order: 21,
    owned: (id) => ({ quote: { client: client(id) } }),
  },
};

export const isExported = (rule: TableRule): rule is ExportedTable =>
  'owned' in rule;

/** Exported tables, parents first. */
export const EXPORT_ORDER: [Prisma.ModelName, ExportedTable][] = (
  Object.entries(ACCOUNT_TABLES) as [Prisma.ModelName, TableRule][]
)
  .filter((e): e is [Prisma.ModelName, ExportedTable] => isExported(e[1]))
  .sort((a, b) => a[1].order - b[1].order);

/** The Prisma client property for a model: `ClientPortalUser` - `clientPortalUser`. */
export const delegateName = (model: string): string =>
  model.charAt(0).toLowerCase() + model.slice(1);
