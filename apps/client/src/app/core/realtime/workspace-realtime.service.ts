import { DestroyRef, Injectable, effect, inject } from '@angular/core';
import { Subject } from 'rxjs';
import { io, Socket } from 'socket.io-client';
import { ApiTokenStore } from '../../domains/auth/api-token.store';
import { AppNotification } from '../../domains/notifications/notification.models';

/** Must match WORKSPACE_SOCKET_PATH on the API - under /api so the /api proxy carries it. */
const SOCKET_PATH = '/api/ws-socket';

export interface QuoteChange {
  quoteId: string;
  status: string;
}

/**
 * The owner's live channel: one socket while signed in, closed on sign-out.
 * Carries stored notifications as they're created and "this quote changed"
 * signals (e.g. the client accepted it in the portal) so open pages refetch.
 */
@Injectable({ providedIn: 'root' })
export class WorkspaceRealtimeService {
  private readonly tokens = inject(ApiTokenStore);
  private socket: Socket | null = null;

  readonly notifications$ = new Subject<AppNotification>();
  readonly quotes$ = new Subject<QuoteChange>();
  /** Fires on reconnect - catch up on anything missed while offline. */
  readonly reconnected$ = new Subject<void>();

  constructor() {
    effect(() => this.connect(this.tokens.token()));
    inject(DestroyRef).onDestroy(() => this.connect(null));
  }

  private connect(token: string | null): void {
    this.socket?.disconnect();
    this.socket = null;
    if (!token) return;

    const socket = io('/ws/notifications', {
      path: SOCKET_PATH,
      auth: { token },
      transports: ['websocket', 'polling'],
      // Fall back to long-polling where a proxy refuses the websocket upgrade.
      tryAllTransports: true,
    });
    let connectedBefore = false;
    socket.on('connect', () => {
      if (connectedBefore) this.reconnected$.next();
      connectedBefore = true;
    });
    socket.on('notification.created', (n: AppNotification) =>
      this.notifications$.next(n),
    );
    socket.on('quote.changed', (c: QuoteChange) => this.quotes$.next(c));
    this.socket = socket;
  }
}
