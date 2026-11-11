import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, from, map, switchMap } from 'rxjs';
import { Currency } from '@foundry/shared-util';
import { PortalAuthApiService } from './portal-auth-api.service';
import { PortalTokenStore } from './portal-token.store';
import {
  AcceptInviteRequest,
  PortalAuthResponse,
  PortalLoginRequest,
  PortalMe,
} from './portal-auth.models';

/**
 * Session state on top of the real portal-auth API: the JWT lives in
 * PortalTokenStore, the authenticated user's full profile (incl. permission
 * flags) is refreshed from GET /portal-auth/me. restore() is called from the
 * app initializer, before the router (and its guards) run.
 */
@Injectable({ providedIn: 'root' })
export class PortalAuthService {
  private readonly api = inject(PortalAuthApiService);
  private readonly tokenStore = inject(PortalTokenStore);

  readonly authenticated = computed(() => this.tokenStore.token() !== null);
  readonly me = signal<PortalMe | null>(null);
  /** The client's currency - project budgets and rates are quoted in it. */
  readonly currency = computed<Currency>(
    () => this.me()?.clientPortal.client.currency ?? 'USD',
  );
  /** This session's portal slug (/:slug/...) - available immediately after
   * login/accept-invite, and restored from storage across reloads even
   * before `/me` resolves. */
  readonly slug = this.tokenStore.slug;

  /** Rehydrates the token from storage and re-syncs the profile against the API. */
  async restore(): Promise<void> {
    if (!this.authenticated()) return;
    await this.refresh();
  }

  refresh(): Promise<void> {
    return new Promise((resolve) => {
      this.api.me().subscribe({
        next: (me) => {
          this.me.set(me);
          this.tokenStore.setSlug(me.clientPortal.slug);
          resolve();
        },
        // A revoked, suspended or expired token 401s here. The interceptor
        // leaves /portal-auth/ calls alone, so drop the session ourselves -
        // otherwise the guard would let a dead session into the shell.
        error: (err: unknown) => {
          if (err instanceof HttpErrorResponse && err.status === 401) {
            this.logout();
          }
          resolve();
        },
      });
    });
  }

  login(body: PortalLoginRequest): Observable<PortalAuthResponse> {
    return this.api
      .login(body)
      .pipe(switchMap((res) => this.applySession(res)));
  }

  acceptInvite(body: AcceptInviteRequest): Observable<PortalAuthResponse> {
    return this.api
      .acceptInvite(body)
      .pipe(switchMap((res) => this.applySession(res)));
  }

  logout(): void {
    this.tokenStore.clear();
    this.me.set(null);
  }

  /** Stores the new session and completes once `/me` has loaded, so the
   * pages navigated to next already know the portal's permissions. */
  private applySession(
    res: PortalAuthResponse,
  ): Observable<PortalAuthResponse> {
    this.me.set(null);
    this.tokenStore.set(res.accessToken, res.user.portalSlug);
    return from(this.refresh()).pipe(map(() => res));
  }
}
