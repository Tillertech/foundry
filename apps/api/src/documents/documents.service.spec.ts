import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DocumentEvents, FileEvents } from '../common/events';
import { DocumentsService } from './documents.service';

/**
 * In-memory document store that evaluates the `where` shapes the service
 * builds, so tenant isolation is checked against real filtering rather than
 * just the query's shape.
 */
interface Row {
  id: string;
  name: string;
  type: string;
  storageKey: string;
  clientId: string | null;
  projectId: string | null;
  workspaceId: string | null;
}

describe('DocumentsService', () => {
  const OWNER_A = 'owner-a';
  const OWNER_B = 'owner-b';
  const workspaceOwner: Record<string, string> = {
    'ws-a1': OWNER_A,
    'ws-a2': OWNER_A,
    'ws-b': OWNER_B,
  };
  const clients: Record<string, { id: string; workspaceId: string }> = {
    'client-a': { id: 'client-a', workspaceId: 'ws-a1' },
    'client-a-other': { id: 'client-a-other', workspaceId: 'ws-a1' },
    'client-a2': { id: 'client-a2', workspaceId: 'ws-a2' },
    'client-b': { id: 'client-b', workspaceId: 'ws-b' },
  };
  const projects: Record<string, { id: string; clientId: string }> = {
    'project-a': { id: 'project-a', clientId: 'client-a' },
    'project-a2': { id: 'project-a2', clientId: 'client-a2' },
    'project-b': { id: 'project-b', clientId: 'client-b' },
  };
  const ownerOfClient = (id: string) =>
    workspaceOwner[clients[id]?.workspaceId];

  let rows: Row[];
  let service: DocumentsService;
  let prisma: {
    document: {
      create: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };
  let pagination: { paginate: jest.Mock };
  let clientsService: { findOne: jest.Mock };
  let projectsService: { findOne: jest.Mock };
  let storage: { upload: jest.Mock; read: jest.Mock; remove: jest.Mock };
  let events: { emit: jest.Mock };
  let workspaces: { findOne: jest.Mock; findDefault: jest.Mock };

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
    if (where.clientId !== undefined && row.clientId !== where.clientId) {
      return false;
    }
    if (where.projectId !== undefined && row.projectId !== where.projectId) {
      return false;
    }
    if (where.type !== undefined && row.type !== where.type) return false;
    return true;
  }

  const row = (overrides: Partial<Row>): Row => ({
    id: 'd-?',
    name: 'Doc',
    type: 'contract',
    storageKey: 'key',
    clientId: null,
    projectId: null,
    workspaceId: 'ws-a1',
    ...overrides,
  });

  const file = {
    originalname: 'MSA.pdf',
    buffer: Buffer.from('pdf'),
  } as Express.Multer.File;

  beforeEach(() => {
    rows = [
      row({ id: 'a-loose', name: 'A unlinked', storageKey: 'a-loose.pdf' }),
      row({ id: 'a-client', clientId: 'client-a', type: 'invoice' }),
      row({ id: 'a-project', projectId: 'project-a' }),
      row({ id: 'a2-loose', workspaceId: 'ws-a2' }),
      row({ id: 'b-loose', name: 'B unlinked', workspaceId: 'ws-b' }),
      row({ id: 'b-client', clientId: 'client-b', workspaceId: 'ws-b' }),
      // Legacy unlinked row the migration couldn't attribute.
      row({ id: 'orphan', workspaceId: null }),
    ];

    prisma = {
      document: {
        create: jest.fn(async ({ data }) => ({ id: 'd-new', ...data })),
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
    };
    pagination = {
      paginate: jest.fn(async (delegate, args) => ({
        results: await delegate.findMany(args),
      })),
    };
    // Mirror ClientsService/ProjectsService/WorkspacesService owner scoping.
    clientsService = {
      findOne: jest.fn(async (ownerId: string, id: string) => {
        if (ownerOfClient(id) !== ownerId) {
          throw new NotFoundException('Client not found');
        }
        return clients[id];
      }),
    };
    projectsService = {
      findOne: jest.fn(async (ownerId: string, id: string) => {
        const project = projects[id];
        if (!project || ownerOfClient(project.clientId) !== ownerId) {
          throw new NotFoundException('Project not found');
        }
        return project;
      }),
    };
    workspaces = {
      findOne: jest.fn(async (ownerId: string, id: string) => {
        if (workspaceOwner[id] !== ownerId) {
          throw new NotFoundException('Workspace not found');
        }
        return { id };
      }),
      findDefault: jest.fn(async (ownerId: string) => ({
        id: Object.keys(workspaceOwner).find(
          (ws) => workspaceOwner[ws] === ownerId,
        ),
      })),
    };
    storage = {
      upload: jest.fn(async () => ({
        key: 'stored-key.pdf',
        url: 'http://api/uploads/stored-key.pdf',
        size: 3,
        mimeType: 'application/pdf',
        originalName: 'MSA.pdf',
      })),
      read: jest.fn(async () => Buffer.from('bytes')),
      remove: jest.fn(),
    };
    events = { emit: jest.fn() };

    service = new DocumentsService(
      prisma as any,
      pagination as any,
      clientsService as any,
      projectsService as any,
      storage as any,
      events as any,
      workspaces as any,
    );
  });

  const ids = (list: { id: string }[]) => list.map((d) => d.id).sort();
  const list = async (ownerId: string, query: Record<string, unknown> = {}) =>
    (await service.findAll(ownerId, query as any, 'http://api/documents'))
      .results;

  describe('tenant isolation', () => {
    it("lists only the caller's own documents - linked and unlinked", async () => {
      expect(ids(await list(OWNER_A))).toEqual([
        'a-client',
        'a-loose',
        'a-project',
        'a2-loose',
      ]);
      expect(ids(await list(OWNER_B))).toEqual(['b-client', 'b-loose']);
    });

    it("never lists another tenant's unlinked documents", async () => {
      // The regression: unlinked documents used to match every owner.
      expect(ids(await list(OWNER_A))).not.toContain('b-loose');
      expect(
        prisma.document.findMany.mock.calls[0][0].where,
      ).not.toHaveProperty('OR');
    });

    it('hides unattributed legacy rows from everyone', async () => {
      expect(ids(await list(OWNER_A))).not.toContain('orphan');
      expect(ids(await list(OWNER_B))).not.toContain('orphan');
    });

    it.each(['b-loose', 'b-client', 'orphan'])(
      '404s reading %s from another tenant',
      async (id) => {
        await expect(service.findOne(OWNER_A, id)).rejects.toThrow(
          'Document not found',
        );
      },
    );

    it("won't download another tenant's file", async () => {
      await expect(service.download(OWNER_A, 'b-loose')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(storage.read).not.toHaveBeenCalled();
    });

    it("won't delete another tenant's document or its stored file", async () => {
      await expect(service.remove(OWNER_A, 'b-loose')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.document.delete).not.toHaveBeenCalled();
      expect(storage.remove).not.toHaveBeenCalled();
    });

    it("won't update another tenant's document", async () => {
      await expect(
        service.update(OWNER_A, 'b-loose', { name: 'hijacked' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.document.update).not.toHaveBeenCalled();
    });

    it("won't adopt another tenant's unlinked document by linking it to an own client", async () => {
      await expect(
        service.update(OWNER_A, 'b-loose', { clientId: 'client-a' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.document.update).not.toHaveBeenCalled();
    });

    it("won't share another tenant's document", async () => {
      await expect(service.share(OWNER_A, 'b-client')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(events.emit).not.toHaveBeenCalled();
    });

    it.each([
      ['client', { clientId: 'client-b' }],
      ['project', { projectId: 'project-b' }],
      ['workspace', { workspaceId: 'ws-b' }],
    ])(
      "won't file an upload under another tenant's %s - and stores nothing",
      async (_label, links) => {
        await expect(
          service.create(OWNER_A, links as any, file),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(storage.upload).not.toHaveBeenCalled();
        expect(prisma.document.create).not.toHaveBeenCalled();
      },
    );

    it.each([
      ['client', { clientId: 'client-b' }],
      ['workspace', { workspaceId: 'ws-b' }],
    ])(
      "can't reach another tenant's documents through a %s filter",
      async (_label, filter) => {
        expect(await list(OWNER_A, filter)).toEqual([]);
      },
    );
  });

  describe('create', () => {
    const createdData = () => prisma.document.create.mock.calls[0][0].data;

    it("files an unlinked upload in the caller's default workspace", async () => {
      await service.create(OWNER_A, {}, file);

      expect(workspaces.findDefault).toHaveBeenCalledWith(OWNER_A);
      expect(createdData()).toEqual({
        workspaceId: 'ws-a1',
        name: 'MSA.pdf',
        storageKey: 'stored-key.pdf',
        size: 3,
        mimeType: 'application/pdf',
      });
    });

    it('files an unlinked upload in an explicitly chosen own workspace', async () => {
      await service.create(OWNER_A, { workspaceId: 'ws-a2' }, file);

      expect(createdData().workspaceId).toBe('ws-a2');
      expect(workspaces.findDefault).not.toHaveBeenCalled();
    });

    it("takes the workspace from the client's", async () => {
      await service.create(OWNER_A, { clientId: 'client-a2' }, file);

      expect(createdData()).toEqual(
        expect.objectContaining({
          clientId: 'client-a2',
          workspaceId: 'ws-a2',
        }),
      );
    });

    it("takes the workspace from the project's client", async () => {
      await service.create(OWNER_A, { projectId: 'project-a2' }, file);

      expect(createdData().workspaceId).toBe('ws-a2');
    });

    it("accepts a client and that client's own project together", async () => {
      await service.create(
        OWNER_A,
        { clientId: 'client-a', projectId: 'project-a' },
        file,
      );

      expect(createdData().workspaceId).toBe('ws-a1');
    });

    it("rejects a project that isn't the document's client's", async () => {
      // Both are the caller's, but the portal of client-a-other would see a
      // document on client-a's project through its project link.
      await expect(
        service.create(
          OWNER_A,
          { clientId: 'client-a-other', projectId: 'project-a' },
          file,
        ),
      ).rejects.toThrow(
        "The project belongs to a different client than the document's",
      );
      expect(storage.upload).not.toHaveBeenCalled();
    });

    it("rejects a requested workspace that contradicts the client's", async () => {
      await expect(
        service.create(
          OWNER_A,
          { clientId: 'client-a2', workspaceId: 'ws-a1' },
          file,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(storage.upload).not.toHaveBeenCalled();
    });

    it('keeps an explicit name over the uploaded file name', async () => {
      await service.create(OWNER_A, { name: 'Signed MSA' }, file);

      expect(createdData().name).toBe('Signed MSA');
    });

    it('announces the stored file only after the links check out', async () => {
      await service.create(OWNER_A, {}, file);

      expect(events.emit).toHaveBeenCalledWith(
        FileEvents.UPLOADED,
        expect.objectContaining({ key: 'stored-key.pdf' }),
      );
    });
  });

  describe('findAll', () => {
    it('combines the filters with the owner scope', async () => {
      expect(ids(await list(OWNER_A, { clientId: 'client-a' }))).toEqual([
        'a-client',
      ]);
      expect(ids(await list(OWNER_A, { projectId: 'project-a' }))).toEqual([
        'a-project',
      ]);
      expect(ids(await list(OWNER_A, { workspaceId: 'ws-a2' }))).toEqual([
        'a2-loose',
      ]);
      expect(ids(await list(OWNER_A, { type: 'invoice' }))).toEqual([
        'a-client',
      ]);
    });

    it('paginates newest upload first with a total count', async () => {
      await service.findAll(
        OWNER_A,
        { cursor: 'c', take: 3 } as any,
        'http://api/documents',
      );

      expect(pagination.paginate.mock.calls[0][2]).toEqual({
        cursor: 'c',
        take: 3,
        orderBy: { uploadedAt: 'desc' },
        baseUrl: 'http://api/documents',
        includeCount: true,
      });
    });
  });

  describe('update', () => {
    const updateData = () => prisma.document.update.mock.calls[0][0].data;

    it('writes plain edits without re-checking links or moving workspace', async () => {
      await service.update(OWNER_A, 'a-client', { name: 'Renamed' });

      expect(updateData()).toEqual({ name: 'Renamed' });
      expect(clientsService.findOne).not.toHaveBeenCalled();
    });

    it("moves the document into a newly linked client's workspace", async () => {
      await service.update(OWNER_A, 'a-loose', { clientId: 'client-a2' });

      expect(updateData()).toEqual({
        clientId: 'client-a2',
        workspaceId: 'ws-a2',
      });
    });

    it("checks a new project against the document's existing client", async () => {
      await expect(
        service.update(OWNER_A, 'a-client', { projectId: 'project-a2' }),
      ).rejects.toThrow(
        "The project belongs to a different client than the document's",
      );
      expect(prisma.document.update).not.toHaveBeenCalled();
    });

    it("checks a new client against the document's existing project", async () => {
      await expect(
        service.update(OWNER_A, 'a-project', { clientId: 'client-a-other' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('allows swapping client and project together', async () => {
      await service.update(OWNER_A, 'a-client', {
        clientId: 'client-a2',
        projectId: 'project-a2',
      });

      expect(updateData().workspaceId).toBe('ws-a2');
    });

    it('keeps the workspace when every link is cleared', async () => {
      await service.update(OWNER_A, 'a-client', { clientId: null as any });

      expect(updateData()).toEqual({ clientId: null });
    });
  });

  describe('download, share and remove', () => {
    it('returns the document with its stored bytes', async () => {
      const result = await service.download(OWNER_A, 'a-loose');

      expect(storage.read).toHaveBeenCalledWith('a-loose.pdf');
      expect(result.content.toString()).toBe('bytes');
    });

    it('refuses to share a document with no client', async () => {
      await expect(service.share(OWNER_A, 'a-loose')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('shares a client document with that client', async () => {
      await service.share(OWNER_A, 'a-client');

      expect(events.emit).toHaveBeenCalledWith(DocumentEvents.SHARED, {
        document: expect.objectContaining({ id: 'a-client' }),
        client: clients['client-a'],
      });
    });

    it('removes the record and then its stored file', async () => {
      await service.remove(OWNER_A, 'a-loose');

      expect(prisma.document.delete).toHaveBeenCalledWith({
        where: { id: 'a-loose' },
      });
      expect(storage.remove).toHaveBeenCalledWith('a-loose.pdf');
    });
  });
});
