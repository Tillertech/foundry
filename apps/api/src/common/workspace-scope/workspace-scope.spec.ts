import type { Request, Response } from 'express';
import { WorkspacesService } from '../../workspaces/workspaces.service';
import {
  WORKSPACE_HEADER,
  WorkspaceScope,
  WorkspaceScopeMiddleware,
} from './workspace-scope';

const OWNER = 'owner-1';
const WS_A = '6f1c1f1e-0d8b-4c6e-9a51-1d6c8f0b2a11';
const WS_B = '2b9d4c3a-7e15-4f02-b8c4-93e0a6d5f722';

/** Runs `fn` inside the middleware, as a request carrying `header` would. */
function withHeader<T>(header: string | undefined, fn: () => T): Promise<T> {
  const middleware = new WorkspaceScopeMiddleware();
  const req = {
    headers: header ? { [WORKSPACE_HEADER]: header } : {},
  } as Request;
  return new Promise((resolve) =>
    middleware.use(req, {} as Response, () => resolve(fn())),
  );
}

describe('WorkspaceScope', () => {
  const scope = new WorkspaceScope();

  it('spans every workspace of the owner without the header', async () => {
    await expect(
      withHeader(undefined, () => scope.owned(OWNER)),
    ).resolves.toEqual({
      ownerId: OWNER,
    });
    await expect(withHeader(undefined, () => scope.cacheKey())).resolves.toBe(
      'all',
    );
  });

  it('narrows to the named workspace, always paired with the owner', async () => {
    await expect(withHeader(WS_A, () => scope.owned(OWNER))).resolves.toEqual({
      ownerId: OWNER,
      id: WS_A,
    });
    await expect(withHeader(WS_A, () => scope.cacheKey())).resolves.toBe(WS_A);
  });

  it('ignores a header that is not a uuid', async () => {
    await expect(
      withHeader('not-a-uuid', () => scope.activeId()),
    ).resolves.toBeUndefined();
    await expect(
      withHeader(`${WS_A}' OR 1=1`, () => scope.activeId()),
    ).resolves.toBeUndefined();
  });

  it('keeps concurrent requests apart', async () => {
    const [a, b] = await Promise.all([
      withHeader(WS_A, async () => {
        await new Promise((r) => setTimeout(r, 5));
        return scope.activeId();
      }),
      withHeader(WS_B, () => scope.activeId()),
    ]);
    expect(a).toBe(WS_A);
    expect(b).toBe(WS_B);
  });

  it('is empty outside a request', () => {
    expect(scope.activeId()).toBeUndefined();
    expect(scope.run(WS_B, () => scope.activeId())).toBe(WS_B);
  });
});

describe('WorkspacesService.findActive', () => {
  const scope = new WorkspaceScope();
  const prisma = {
    workspace: {
      findFirst: vi.fn(
        async ({ where }: { where: { id?: string; ownerId: string } }) =>
          where.id === WS_B
            ? null
            : { id: where.id ?? WS_A, ownerId: where.ownerId },
      ),
    },
  };
  const service = new WorkspacesService(prisma as never, {} as never, scope);

  beforeEach(() => {
    prisma.workspace.findFirst.mockClear();
  });

  it('is the default workspace without the header', async () => {
    await expect(service.findActive(OWNER)).resolves.toMatchObject({
      id: WS_A,
    });
    expect(prisma.workspace.findFirst).toHaveBeenCalledWith({
      where: { ownerId: OWNER },
      orderBy: { createdAt: 'asc' },
    });
  });

  it("404s a header naming a workspace that isn't the caller's", async () => {
    await expect(
      scope.run(WS_B, () => service.findActive(OWNER)),
    ).rejects.toThrow('Workspace not found');
  });
});
