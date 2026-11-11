import { Injectable, NotFoundException } from '@nestjs/common';
import {
  PaginationRes,
  PaginationService,
} from '../common/pagination/pagination.service';
import {
  effectivePortalPermission,
  PortalPermissionFlag,
  WORKSPACE_PORTAL_DEFAULTS_SELECT,
} from '../common/portal-permissions';
import {
  ClientPortalUserStatus,
  PortalNotificationKind,
} from '../generated/prisma/enums';
import type { PortalNotificationModel as PortalNotification } from '../generated/prisma/models';
import { PrismaService } from '../prisma/prisma.service';
import { ListPortalNotificationsQueryDto } from './dto/list-portal-notifications-query.dto';
import {
  PortalNotificationsGateway,
  PortalSocketEvents,
} from './portal-notifications.gateway';

export interface PortalNotificationInput {
  kind: PortalNotificationKind;
  title: string;
  body: string;
  resourceId?: string;
}

/**
 * Who in a client's portal may hear about something, and the delivery of it
 * (stored per user + pushed live). Reads go through the same rules as the
 * portal-api: portal active, effective permission flag on, and - for
 * project-scoped news - the project actively shared and inside the user's
 * own project access.
 */
@Injectable()
export class PortalNotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pagination: PaginationService,
    private readonly gateway: PortalNotificationsGateway,
  ) {}

  /**
   * Portal users of `clientId` allowed to see something gated by `flag`
   * (and, when given, inside `projectId`). Suspended users are skipped;
   * invited ones are included so the news is waiting at first sign-in.
   *
   * `billing` follows the billing rule instead (invoices, quotes): users on
   * "all shared projects" get every client record, users on "specific
   * projects" only project-less ones and those of their own shared projects.
   */
  async recipients(
    clientId: string,
    flag: PortalPermissionFlag,
    projectId?: string | null,
    { billing = false }: { billing?: boolean } = {},
  ): Promise<string[]> {
    const portal = await this.prisma.clientPortal.findUnique({
      where: { clientId },
      include: {
        permission: true,
        client: {
          select: { workspace: { select: WORKSPACE_PORTAL_DEFAULTS_SELECT } },
        },
        ...(projectId
          ? {
              clientPortalProjects: {
                where: { projectId, active: true },
                select: { id: true },
              },
            }
          : {}),
      },
    });
    if (!portal?.active || !portal.permission) return [];
    const permission = effectivePortalPermission(
      portal.permission,
      portal.client.workspace,
    );
    if (!permission[flag]) return [];
    const projectShared = !!portal.clientPortalProjects?.length;
    if (projectId && !billing && !projectShared) return [];

    const users = await this.prisma.clientPortalUser.findMany({
      where: {
        clientPortalId: portal.id,
        status: { not: ClientPortalUserStatus.suspended },
        ...(projectId
          ? {
              OR: [
                { allProjects: true },
                ...(projectShared
                  ? [{ projects: { some: { projectId } } }]
                  : []),
              ],
            }
          : {}),
      },
      select: { id: true },
    });
    return users.map((u) => u.id);
  }

  /** Stores one notification per user and pushes each live. */
  async notify(
    portalUserIds: string[],
    data: PortalNotificationInput,
  ): Promise<void> {
    if (!portalUserIds.length) return;
    const created = await this.prisma.portalNotification.createManyAndReturn({
      data: portalUserIds.map((clientPortalUserId) => ({
        clientPortalUserId,
        ...data,
      })),
    });
    for (const n of created) {
      this.gateway.emitToUsers(
        [n.clientPortalUserId],
        PortalSocketEvents.NOTIFICATION_CREATED,
        n,
      );
    }
  }

  /** Live-only signal (no stored notification). */
  push(portalUserIds: string[], event: string, payload: unknown): void {
    this.gateway.emitToUsers(portalUserIds, event, payload);
  }

  list(
    portalUserId: string,
    query: ListPortalNotificationsQueryDto,
    baseUrl: string,
  ): Promise<PaginationRes<PortalNotification>> {
    const { cursor, take, unread } = query;
    return this.pagination.paginate<PortalNotification>(
      this.prisma.portalNotification,
      {
        where: {
          clientPortalUserId: portalUserId,
          ...(unread ? { readAt: null } : {}),
        },
      },
      { cursor, take, orderBy: { createdAt: 'desc' }, baseUrl },
    );
  }

  async unreadCount(portalUserId: string): Promise<{ count: number }> {
    const count = await this.prisma.portalNotification.count({
      where: { clientPortalUserId: portalUserId, readAt: null },
    });
    return { count };
  }

  async markRead(
    portalUserId: string,
    id: string,
  ): Promise<PortalNotification> {
    const n = await this.prisma.portalNotification.findFirst({
      where: { id, clientPortalUserId: portalUserId },
    });
    if (!n) throw new NotFoundException('Notification not found');
    if (n.readAt) return n;
    return this.prisma.portalNotification.update({
      where: { id },
      data: { readAt: new Date() },
    });
  }

  async markAllRead(portalUserId: string): Promise<{ count: number }> {
    await this.prisma.portalNotification.updateMany({
      where: { clientPortalUserId: portalUserId, readAt: null },
      data: { readAt: new Date() },
    });
    return { count: 0 };
  }
}
