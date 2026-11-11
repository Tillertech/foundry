import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  OnGatewayConnection,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ClientPortalUserStatus } from '../generated/prisma/enums';
import type { PortalJwtPayload } from '../portal-auth/portal-jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';

/** socket.io path under /api, so the SPAs' existing /api proxies (dev and nginx) carry it. */
export const PORTAL_SOCKET_PATH = '/api/portal-socket';

export const PortalSocketEvents = {
  NOTIFICATION_CREATED: 'notification.created',
  /** { projectId, milestoneId (null = reorder), removed } - refetch just that milestone. */
  MILESTONE_CHANGED: 'milestone.changed',
  /** { quoteId, removed } - refetch just that quote. */
  QUOTE_CHANGED: 'quote.changed',
} as const;

const room = (portalUserId: string) => `portal-user:${portalUserId}`;

/**
 * Realtime channel for client-portal users. Same admission rules as
 * PortalJwtAuthGuard: a portal (`kind: portal_user`) token whose user still
 * exists, is active and belongs to the token's portal - workspace tokens are
 * rejected. Each socket joins its user's own room; the publisher decides per
 * user what they may see, so rooms never mix permission levels.
 */
@WebSocketGateway({
  namespace: '/portal',
  path: PORTAL_SOCKET_PATH,
  cors: { origin: '*', credentials: true },
})
export class PortalNotificationsGateway implements OnGatewayConnection {
  @WebSocketServer()
  private readonly server: Server;

  private readonly logger = new Logger(PortalNotificationsGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async handleConnection(@ConnectedSocket() client: Socket): Promise<void> {
    const raw: string | undefined = client.handshake.auth?.token;
    if (!raw) return this.reject(client, 'no token');
    let payload: PortalJwtPayload;
    try {
      payload = this.jwtService.verify<PortalJwtPayload>(raw);
    } catch {
      return this.reject(client, 'invalid token');
    }
    if (payload.kind !== 'portal_user') {
      return this.reject(client, 'not a portal token');
    }
    const user = await this.prisma.clientPortalUser.findUnique({
      where: { id: payload.sub },
      select: { status: true, clientPortalId: true },
    });
    if (
      !user ||
      user.clientPortalId !== payload.clientPortalId ||
      user.status !== ClientPortalUserStatus.active
    ) {
      return this.reject(client, 'inactive user');
    }
    await client.join(room(payload.sub));
  }

  emitToUsers(portalUserIds: string[], event: string, payload: unknown): void {
    if (!portalUserIds.length || !this.server) return;
    this.server.to(portalUserIds.map(room)).emit(event, payload);
  }

  private reject(client: Socket, reason: string): void {
    this.logger.warn(`Portal WS reject - ${reason} (${client.id})`);
    client.disconnect();
  }
}
