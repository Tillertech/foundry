import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import type { JwtPayload } from '../identity/auth/jwt-auth.guard';

/** socket.io path under /api, so the SPA's existing /api proxies (dev and nginx) carry it. */
export const WORKSPACE_SOCKET_PATH = '/api/ws-socket';

@WebSocketGateway({
  namespace: '/ws/notifications',
  path: WORKSPACE_SOCKET_PATH,
  cors: { origin: '*', credentials: true },
})
export class NotificationGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  private readonly server: Server;

  private readonly logger = new Logger(NotificationGateway.name);

  constructor(private readonly jwtService: JwtService) {}

  handleConnection(@ConnectedSocket() client: Socket) {
    const raw: string =
      client.handshake.auth?.token ??
      (client.handshake.headers?.authorization ?? '').replace('Bearer ', '');

    if (!raw) {
      this.logger.warn(`WS reject - no token (${client.id})`);
      client.disconnect();
      return;
    }

    try {
      const payload = this.jwtService.verify<JwtPayload & { kind?: string }>(
        raw,
      );
      if (payload.kind) {
        this.logger.warn(`WS reject - portal token (${client.id})`);
        client.disconnect();
        return;
      }
      void client.join(`user:${payload.sub}`);
      this.logger.log(`WS connected - ${payload.email}`);
    } catch {
      this.logger.warn(`WS reject - invalid token (${client.id})`);
      client.disconnect();
    }
  }

  handleDisconnect(@ConnectedSocket() client: Socket) {
    this.logger.log(`WS disconnected - ${client.id}`);
  }

  emitToUser(userId: string, event: string, payload: unknown) {
    this.server.to(`user:${userId}`).emit(event, payload);
  }
}
