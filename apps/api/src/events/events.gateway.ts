import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

/**
 * Unauthenticated default-namespace socket (liveness ping only).
 *
 * It must never broadcast domain events: anyone can connect here without a
 * token, so a `server.emit` reaches every tenant and anonymous sockets alike.
 * It used to rebroadcast `file.**` (every upload's storage key and public
 * URL) and `entity.**` that way. Per-user realtime events go through
 * NotificationGateway, which authenticates and emits to `user:<id>` rooms.
 */
@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(EventsGateway.name);

  @WebSocketServer()
  server!: Server;

  handleConnection(client: Socket): void {
    this.logger.debug(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket): void {
    this.logger.debug(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('ping')
  ping(): { pong: number } {
    return { pong: Date.now() };
  }
}
