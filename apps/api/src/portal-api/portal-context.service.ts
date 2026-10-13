import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  effectivePortalPermission,
  PortalPermissionFlag,
  PortalPermissionFlags,
  WORKSPACE_PORTAL_DEFAULTS_SELECT,
} from '../common/portal-permissions';
import { PrismaService } from '../prisma/prisma.service';

export interface PortalContext {
  clientId: string;
  /** Effective flags: the workspace defaults, or the portal's own when it doesn't inherit. */
  permission: PortalPermissionFlags;
}

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
      include: {
        permission: true,
        client: {
          select: { workspace: { select: WORKSPACE_PORTAL_DEFAULTS_SELECT } },
        },
      },
    });
    if (!portal || !portal.permission) {
      throw new NotFoundException('Client portal not found');
    }
    if (!portal.active) {
      throw new ForbiddenException('This client portal is currently disabled');
    }
    return {
      clientId: portal.clientId,
      permission: effectivePortalPermission(
        portal.permission,
        portal.client.workspace,
      ),
    };
  }

  /** Resolves the context and asserts the given view flag is on. */
  async require(
    clientPortalId: string,
    flag: PortalPermissionFlag,
  ): Promise<PortalContext> {
    const context = await this.resolve(clientPortalId);
    if (!context.permission[flag]) {
      throw new ForbiddenException(`This portal does not have ${flag} enabled`);
    }
    return context;
  }

  /**
   * Ids of the projects this portal user can see: the ones actively shared
   * into the portal, narrowed to the user's own list when they aren't on
   * "all projects". A user's list can only narrow the portal's shares - a
   * project unshared from the portal disappears for everyone.
   */
  async sharedProjectIds(
    clientPortalId: string,
    portalUserId: string,
  ): Promise<string[]> {
    const user = await this.prisma.clientPortalUser.findFirst({
      where: { id: portalUserId, clientPortalId },
      select: { allProjects: true },
    });
    if (!user) return [];
    const rows = await this.prisma.clientPortalProject.findMany({
      where: {
        clientPortalId,
        active: true,
        ...(user.allProjects
          ? {}
          : {
              project: {
                clientPortalUserProjects: {
                  some: { clientPortalUserId: portalUserId },
                },
              },
            }),
      },
      select: { projectId: true },
    });
    return rows.map((row) => row.projectId);
  }
}
