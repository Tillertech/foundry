import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { PortalPermissionModel as PortalPermission } from '../generated/prisma/models';

export interface PortalContext {
  clientId: string;
  permission: PortalPermission;
}

type PermissionFlag =
  | 'viewProjects'
  | 'viewDocuments'
  | 'viewQuotes'
  | 'viewPayments';

/**
 * Shared ownership resolution for every portal-api read endpoint: given the
 * clientPortalId out of the portal JWT, find the underlying client and
 * permission flags, and reject disabled portals up front.
 */
@Injectable()
export class PortalContextService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(clientPortalId: string): Promise<PortalContext> {
    const portal = await this.prisma.clientPortal.findUnique({
      where: { id: clientPortalId },
      include: { permission: true },
    });
    if (!portal || !portal.permission) {
      throw new NotFoundException('Client portal not found');
    }
    if (!portal.active) {
      throw new ForbiddenException('This client portal is currently disabled');
    }
    return { clientId: portal.clientId, permission: portal.permission };
  }

  /** Resolves the context and asserts the given view flag is on. */
  async require(
    clientPortalId: string,
    flag: PermissionFlag,
  ): Promise<PortalContext> {
    const context = await this.resolve(clientPortalId);
    if (!context.permission[flag]) {
      throw new ForbiddenException(
        `This portal does not have ${flag} enabled`,
      );
    }
    return context;
  }

  /** Ids of the projects actively shared into this portal. */
  async sharedProjectIds(clientPortalId: string): Promise<string[]> {
    const rows = await this.prisma.clientPortalProject.findMany({
      where: { clientPortalId, active: true },
      select: { projectId: true },
    });
    return rows.map((row) => row.projectId);
  }
}
