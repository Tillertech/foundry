import { Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

/**
 * Pushes domain events (emitted through EventEmitter2) to connected clients.
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

  @OnEvent('entity.**')
  onEntityEvent(payload: unknown): void {
    this.server?.emit('entity.changed', payload);
  }

  @OnEvent('file.**')
  onFileEvent(payload: unknown): void {
    this.server?.emit('file.changed', payload);
  }
}
