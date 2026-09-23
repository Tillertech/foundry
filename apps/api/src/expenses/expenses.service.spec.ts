import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ExpensesService } from './expenses.service';

/**
 * Minimal in-memory expense store that evaluates the `where` shapes the
 * service builds, so tenant isolation is checked against real filtering
 * rather than just the query's shape.
 */
interface Row {
  id: string;
  vendor: string;
  category: string;
  billable: boolean;
  projectId: string | null;
  workspaceId: string | null;
}

describe('ExpensesService', () => {
  const OWNER_A = 'owner-a';
  const OWNER_B = 'owner-b';
  const workspaceOwner: Record<string, string> = {
    'ws-a1': OWNER_A,
    'ws-a2': OWNER_A,
    'ws-b': OWNER_B,
  };
  const projectClient: Record<string, string> = {
    'project-a': 'client-a',
    'project-a2': 'client-a2',
    'project-b': 'client-b',
  };
  const clientWorkspace: Record<string, string> = {
    'client-a': 'ws-a1',
    'client-a2': 'ws-a2',
    'client-b': 'ws-b',
  };

  let rows: Row[];
  let service: ExpensesService;
  let prisma: {
    expense: {
      create: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    client: { findUnique: jest.Mock };
  };
  let pagination: { paginate: jest.Mock };
  let projects: { findOne: jest.Mock };
  let workspaces: { findOne: jest.Mock; findDefault: jest.Mock };

  /** Evaluates the subset of Prisma's where syntax the service uses. */
  function matches(row: Row, where: Record<string, any> = {}): boolean {
    if (where.id !== undefined && row.id !== where.id) return false;
    if (where.workspace) {
      if (!row.workspaceId) return false;
      if (workspaceOwner[row.workspaceId] !== where.workspace.ownerId) {
        return false;
      }
      if (where.workspace.id && row.workspaceId !== where.workspace.id) {
        return false;
      }
    }
    if (where.projectId !== undefined && row.projectId !== where.projectId) {
      return false;
    }
    if (where.project?.clientId) {
      if (!row.projectId) return false;
      if (projectClient[row.projectId] !== where.project.clientId) return false;
    }
    if (where.category !== undefined && row.category !== where.category) {
      return false;
    }
    if (where.billable !== undefined && row.billable !== where.billable) {
      return false;
    }
    return true;
  }

  const row = (overrides: Partial<Row>): Row => ({
    id: 'e-?',
    vendor: 'Vendor',
    category: 'software',
    billable: false,
    projectId: null,
    workspaceId: 'ws-a1',
    ...overrides,
  });

  beforeEach(() => {
    rows = [
      row({ id: 'a-loose', vendor: 'A loose', workspaceId: 'ws-a1' }),
      row({
        id: 'a-project',
        vendor: 'A on project',
        projectId: 'project-a',
        billable: true,
      }),
      row({
        id: 'a2-loose',
        vendor: 'A second workspace',
        workspaceId: 'ws-a2',
      }),
      row({ id: 'b-loose', vendor: 'B loose', workspaceId: 'ws-b' }),
      row({
        id: 'b-project',
        vendor: 'B on project',
        projectId: 'project-b',
        workspaceId: 'ws-b',
        billable: true,
      }),
      // Legacy project-less row the migration couldn't attribute.
      row({ id: 'orphan', vendor: 'Unattributed', workspaceId: null }),
    ];

    prisma = {
      expense: {
        create: jest.fn(async ({ data }) => ({ id: 'e-new', ...data })),
        findMany: jest.fn(async ({ where }) =>
          rows.filter((r) => matches(r, where)),
        ),
        findFirst: jest.fn(
          async ({ where }) => rows.find((r) => matches(r, where)) ?? null,
        ),
        update: jest.fn(async ({ where, data }) => ({
          ...rows.find((r) => r.id === where.id),
          ...data,
        })),
        delete: jest.fn(async ({ where }) =>
          rows.find((r) => r.id === where.id),
        ),
      },
      client: {
        findUnique: jest.fn(async ({ where }) =>
          clientWorkspace[where.id]
            ? { workspaceId: clientWorkspace[where.id] }
            : null,
        ),
      },
    };
    pagination = {
      paginate: jest.fn(async (delegate, args) => ({
        results: await delegate.findMany(args),
      })),
    };
    // Mirrors ProjectsService.findOne's owner scoping.
    projects = {
      findOne: jest.fn(async (ownerId: string, id: string) => {
        const clientId = projectClient[id];
        if (
          !clientId ||
          workspaceOwner[clientWorkspace[clientId]] !== ownerId
        ) {
          throw new NotFoundException('Project not found');
        }
        return { id, clientId };
      }),
    };
    // Mirrors WorkspacesService.findOne/findDefault.
    workspaces = {
      findOne: jest.fn(async (ownerId: string, id: string) => {
        if (workspaceOwner[id] !== ownerId) {
          throw new NotFoundException('Workspace not found');
        }
        return { id };
      }),
      findDefault: jest.fn(async (ownerId: string) => {
        const id = Object.keys(workspaceOwner).find(
          (ws) => workspaceOwner[ws] === ownerId,
        );
        if (!id) throw new NotFoundException('No workspace found');
        return { id };
      }),
    };

    service = new ExpensesService(
      prisma as any,
      pagination as any,
      projects as any,
      workspaces as any,
    );
  });

  const ids = (list: { id: string }[]) => list.map((e) => e.id).sort();
  const list = async (ownerId: string, query: Record<string, unknown> = {}) =>
    (await service.findAll(ownerId, query as any, 'http://api/expenses'))
      .results;

  describe('tenant isolation', () => {
    it("lists only the caller's own expenses - project-linked and project-less", async () => {
      expect(ids(await list(OWNER_A))).toEqual([
        'a-loose',
        'a-project',
        'a2-loose',
      ]);
      expect(ids(await list(OWNER_B))).toEqual(['b-loose', 'b-project']);
    });

    it("never lists another workspace's project-less expenses", async () => {
      // The regression: project-less expenses used to match every owner.
      const seenByA = ids(await list(OWNER_A));

      expect(seenByA).not.toContain('b-loose');
      expect(prisma.expense.findMany.mock.calls[0][0].where).not.toHaveProperty(
        'OR',
      );
    });

    it('hides unattributed legacy rows from everyone', async () => {
      expect(ids(await list(OWNER_A))).not.toContain('orphan');
      expect(ids(await list(OWNER_B))).not.toContain('orphan');
      await expect(service.findOne(OWNER_A, 'orphan')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it.each(['b-loose', 'b-project'])(
      "404s reading another tenant's expense %s",
      async (id) => {
        await expect(service.findOne(OWNER_A, id)).rejects.toThrow(
          'Expense not found',
        );
      },
    );

    it.each(['b-loose', 'b-project'])(
      "refuses to update another tenant's expense %s",
      async (id) => {
        await expect(
          service.update(OWNER_A, id, { vendor: 'hijacked' }),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(prisma.expense.update).not.toHaveBeenCalled();
      },
    );

    it.each(['b-loose', 'b-project'])(
      "refuses to delete another tenant's expense %s",
      async (id) => {
        await expect(service.remove(OWNER_A, id)).rejects.toBeInstanceOf(
          NotFoundException,
        );
        expect(prisma.expense.delete).not.toHaveBeenCalled();
      },
    );

    it("won't file a new expense under another tenant's project", async () => {
      await expect(
        service.create(OWNER_A, {
          vendor: 'x',
          amount: 1,
          date: '2026-09-01',
          projectId: 'project-b',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.expense.create).not.toHaveBeenCalled();
    });

    it("won't file a new expense into another tenant's workspace", async () => {
      await expect(
        service.create(OWNER_A, {
          vendor: 'x',
          amount: 1,
          date: '2026-09-01',
          workspaceId: 'ws-b',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.expense.create).not.toHaveBeenCalled();
    });

    it("won't move an own expense onto another tenant's project", async () => {
      await expect(
        service.update(OWNER_A, 'a-loose', { projectId: 'project-b' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.expense.update).not.toHaveBeenCalled();
    });

    it("can't reach another tenant's expenses through a client filter", async () => {
      expect(await list(OWNER_A, { clientId: 'client-b' })).toEqual([]);
    });

    it("can't reach another tenant's expenses through a workspace filter", async () => {
      expect(await list(OWNER_A, { workspaceId: 'ws-b' })).toEqual([]);
    });
  });

  describe('create', () => {
    const dto = { vendor: 'Figma', amount: 45, date: '2026-09-01' };
    const createdData = () => prisma.expense.create.mock.calls[0][0].data;

    it("files a project-less expense in the caller's default workspace", async () => {
      await service.create(OWNER_A, dto);

      expect(workspaces.findDefault).toHaveBeenCalledWith(OWNER_A);
      expect(createdData()).toEqual({ ...dto, workspaceId: 'ws-a1' });
    });

    it('files a project-less expense in an explicitly chosen own workspace', async () => {
      await service.create(OWNER_A, { ...dto, workspaceId: 'ws-a2' });

      expect(workspaces.findOne).toHaveBeenCalledWith(OWNER_A, 'ws-a2');
      expect(workspaces.findDefault).not.toHaveBeenCalled();
      expect(createdData().workspaceId).toBe('ws-a2');
    });

    it("takes the workspace from the project's client", async () => {
      await service.create(OWNER_A, { ...dto, projectId: 'project-a2' });

      expect(projects.findOne).toHaveBeenCalledWith(OWNER_A, 'project-a2');
      expect(createdData()).toEqual({
        ...dto,
        projectId: 'project-a2',
        workspaceId: 'ws-a2',
      });
      expect(workspaces.findDefault).not.toHaveBeenCalled();
    });

    it("accepts a requested workspace that agrees with the project's", async () => {
      await service.create(OWNER_A, {
        ...dto,
        projectId: 'project-a2',
        workspaceId: 'ws-a2',
      });

      expect(createdData().workspaceId).toBe('ws-a2');
    });

    it("rejects a requested workspace that contradicts the project's", async () => {
      await expect(
        service.create(OWNER_A, {
          ...dto,
          projectId: 'project-a2',
          workspaceId: 'ws-a1',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.expense.create).not.toHaveBeenCalled();
    });

    it('surfaces a caller with no workspace at all', async () => {
      await expect(service.create('owner-nobody', dto)).rejects.toThrow(
        'No workspace found',
      );
    });

    it('404s if the project has lost its client between checks', async () => {
      prisma.client.findUnique.mockResolvedValue(null);

      await expect(
        service.create(OWNER_A, { ...dto, projectId: 'project-a' }),
      ).rejects.toThrow('Project not found');
    });

    it('returns which invoice billed the expense', async () => {
      await service.create(OWNER_A, dto);

      expect(prisma.expense.create.mock.calls[0][0].include).toEqual({
        invoiceItem: {
          select: { invoice: { select: { id: true, number: true } } },
        },
      });
    });
  });

  describe('findAll', () => {
    it('combines the filters with the owner scope', async () => {
      expect(
        ids(await list(OWNER_A, { projectId: 'project-a', billable: true })),
      ).toEqual(['a-project']);
      expect(ids(await list(OWNER_A, { clientId: 'client-a' }))).toEqual([
        'a-project',
      ]);
      expect(ids(await list(OWNER_A, { workspaceId: 'ws-a2' }))).toEqual([
        'a2-loose',
      ]);
      expect(ids(await list(OWNER_A, { billable: false }))).toEqual([
        'a-loose',
        'a2-loose',
      ]);
    });

    it('filters on billable=false rather than dropping it as falsy', async () => {
      await list(OWNER_A, { billable: false });

      expect(prisma.expense.findMany.mock.calls[0][0].where.billable).toBe(
        false,
      );
    });

    it('paginates newest first with a total count', async () => {
      await service.findAll(
        OWNER_A,
        { cursor: 'c1', take: 5 } as any,
        'http://api/expenses',
      );

      expect(pagination.paginate.mock.calls[0][2]).toEqual({
        cursor: 'c1',
        take: 5,
        orderBy: { date: 'desc' },
        baseUrl: 'http://api/expenses',
        includeCount: true,
      });
    });
  });

  describe('update', () => {
    const updateData = () => prisma.expense.update.mock.calls[0][0].data;

    it('writes plain edits without touching the workspace', async () => {
      await service.update(OWNER_A, 'a-loose', {
        vendor: 'Renamed',
        amount: 9,
      });

      expect(updateData()).toEqual({ vendor: 'Renamed', amount: 9 });
      expect(projects.findOne).not.toHaveBeenCalled();
    });

    it("moves the expense into the new project's workspace", async () => {
      await service.update(OWNER_A, 'a-loose', { projectId: 'project-a2' });

      expect(updateData()).toEqual({
        projectId: 'project-a2',
        workspaceId: 'ws-a2',
      });
    });

    it('keeps the workspace when a project link is cleared', async () => {
      await service.update(OWNER_A, 'a-project', { projectId: null as any });

      expect(updateData()).toEqual({ projectId: null });
    });

    it('checks ownership before looking at the new project', async () => {
      await expect(
        service.update(OWNER_A, 'missing', { projectId: 'project-a' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(projects.findOne).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('deletes an owned expense and returns it', async () => {
      await expect(service.remove(OWNER_A, 'a-loose')).resolves.toEqual(
        expect.objectContaining({ id: 'a-loose' }),
      );
      expect(prisma.expense.delete).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'a-loose' } }),
      );
    });
  });
});
