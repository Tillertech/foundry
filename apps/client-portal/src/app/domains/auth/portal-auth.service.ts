import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
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
        // An invalid/expired token 401s here; the interceptor already clears
        // the session on 401, so just resolve and let the guard redirect.
        error: () => resolve(),
      });
    });
  }

  login(body: PortalLoginRequest): Observable<PortalAuthResponse> {
    return this.api.login(body).pipe(tap((res) => this.applySession(res)));
  }

  acceptInvite(body: AcceptInviteRequest): Observable<PortalAuthResponse> {
    return this.api
      .acceptInvite(body)
      .pipe(tap((res) => this.applySession(res)));
  }

  logout(): void {
    this.tokenStore.clear();
    this.me.set(null);
  }

  private applySession(res: PortalAuthResponse): void {
    this.tokenStore.set(res.accessToken, res.user.portalSlug);
    void this.refresh();
  }
}
