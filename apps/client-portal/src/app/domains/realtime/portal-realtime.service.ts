import { DestroyRef, Injectable, effect, inject } from '@angular/core';
import { Subject } from 'rxjs';
import { io, Socket } from 'socket.io-client';
import { PortalTokenStore } from '../auth/portal-token.store';
import { PortalNotification } from '../notifications/notification.models';

/** Must match PORTAL_SOCKET_PATH on the API - under /api so the /api proxy carries it. */
const SOCKET_PATH = '/api/portal-socket';

export interface MilestoneChange {
  projectId: string;
  /** null for a whole-list change (reorder). */
  milestoneId: string | null;
  removed: boolean;
}

export interface QuoteChange {
  quoteId: string;
  removed: boolean;
}

/**
 * One socket per signed-in portal user, opened when a token appears and
 * closed on sign-out. Signals name exactly what changed (a quote, or one
 * milestone of a project) but never carry the data itself: pages refetch just
 * that item through the permission-checked REST endpoints and swap it in.
 */
@Injectable({ providedIn: 'root' })
export class PortalRealtimeService {
  private readonly tokens = inject(PortalTokenStore);
  private socket: Socket | null = null;

  readonly notifications$ = new Subject<PortalNotification>();
  readonly milestones$ = new Subject<MilestoneChange>();
  readonly quotes$ = new Subject<QuoteChange>();
  /** Fires on (re)connect - a good moment to catch up on anything missed. */
  readonly reconnected$ = new Subject<void>();

  constructor() {
    effect(() => this.connect(this.tokens.token()));
    inject(DestroyRef).onDestroy(() => this.connect(null));
  }

  private connect(token: string | null): void {
    this.socket?.disconnect();
    this.socket = null;
    if (!token) return;

    const socket = io('/portal', {
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
    socket.on('notification.created', (n: PortalNotification) =>
      this.notifications$.next(n),
    );
    socket.on('milestone.changed', (c: MilestoneChange) =>
      this.milestones$.next(c),
    );
    socket.on('quote.changed', (c: QuoteChange) => this.quotes$.next(c));
    this.socket = socket;
  }
}
