import { Global, Injectable, Module, NestMiddleware } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { NextFunction, Request, Response } from 'express';

/**
 * Optional request header that narrows a request to one of the caller's
 * workspaces. Without it the API behaves as it always has: lists and reports
 * span all of the caller's workspaces and new records go to the default
 * (oldest) one.
 */
export const WORKSPACE_HEADER = 'x-workspace-id';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ScopeContext {
  workspaceId?: string;
}

const storage = new AsyncLocalStorage<ScopeContext>();

/**
 * The workspace a request acts on, when it names one. Ownership is never
 * implied by the header: `owned()` always pairs the id with the caller's
 * ownerId, so a foreign workspace id simply matches nothing.
 */
@Injectable()
export class WorkspaceScope {
  /** The workspace id from the request header, if any. */
  activeId(): string | undefined {
    return storage.getStore()?.workspaceId;
  }

  /** Prisma `WorkspaceWhereInput` for "the caller's workspaces in scope". */
  owned(ownerId: string): { ownerId: string; id?: string } {
    const id = this.activeId();
    return id ? { ownerId, id } : { ownerId };
  }

  /** Stable fragment for cache keys, so scoped and unscoped results never mix. */
  cacheKey(): string {
    return this.activeId() ?? 'all';
  }

  /** Runs `fn` with an explicit scope - for jobs and tests outside a request. */
  run<T>(workspaceId: string | undefined, fn: () => T): T {
    return storage.run({ workspaceId }, fn);
  }
}

@Injectable()
export class WorkspaceScopeMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction): void {
    const raw = req.headers[WORKSPACE_HEADER];
    const workspaceId =
      typeof raw === 'string' && UUID.test(raw) ? raw : undefined;
    storage.run({ workspaceId }, next);
  }
}

@Global()
@Module({
  providers: [WorkspaceScope, WorkspaceScopeMiddleware],
  exports: [WorkspaceScope],
})
export class WorkspaceScopeModule {}
