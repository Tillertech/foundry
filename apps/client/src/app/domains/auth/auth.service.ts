import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';
import { SecureStorageService } from '../../core/storage/secure-storage.service';
import { ApiTokenStore } from './api-token.store';
import { AuthApiService } from './auth-api.service';
import {
  AuthResponse,
  AuthUser,
  LoginChallenge,
  LoginRequest,
  SignupRequest,
  SignupResponse,
  VerifyEmailRequest,
  VerifyLoginRequest,
} from './auth.models';

const USER_KEY = 'foundry.u';

/**
 * Session state on top of the Foundry auth API: the JWT lives in
 * ApiTokenStore and the signed-in user is cached AES-GCM-encrypted in
 * localStorage. Both are hydrated by restore() from the app initializer
 * before the router runs, then re-synced against GET /auth/me.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly router = inject(Router);
  private readonly api = inject(AuthApiService);
  private readonly tokenStore = inject(ApiTokenStore);
  private readonly storage = inject(SecureStorageService);

  readonly user = signal<AuthUser | null>(null);
  readonly authenticated = computed(() => this.tokenStore.token() !== null);
  readonly initials = computed(() => {
    const u = this.user();
    if (!u) return '';
    return u.name
      .split(' ')
      .map((s) => s[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
  });

  /** Hydrates token + cached user from encrypted storage (app initializer). */
  async restore(): Promise<void> {
    await this.tokenStore.restore();
    if (!this.authenticated()) return;
    const raw = await this.storage.getItem(USER_KEY);
    if (raw) {
      try {
        this.user.set(JSON.parse(raw) as AuthUser);
      } catch {
        this.storage.removeItem(USER_KEY);
      }
    }
  }

  /** Step one of login: verifies credentials and triggers a sign-in code. */
  login(body: LoginRequest): Observable<LoginChallenge> {
    return this.api.login(body);
  }

  /** Step two of login: confirms the emailed code and establishes the session. */
  verifyLogin(body: VerifyLoginRequest): Observable<AuthResponse> {
    return this.api.verifyLogin(body).pipe(tap((res) => this.setUser(res.user)));
  }

  /** Registers the account; returns the pending email (no session yet). */
  signup(body: SignupRequest): Observable<SignupResponse> {
    return this.api.signup(body);
  }

  /** Confirms the emailed code and establishes the session. */
  verifyEmail(body: VerifyEmailRequest): Observable<AuthResponse> {
    return this.api.verifyEmail(body).pipe(tap((res) => this.setUser(res.user)));
  }

  /** Re-syncs the cached user with the API; drops the session on 401. */
  refresh(): void {
    if (!this.authenticated()) return;
    this.api.me().subscribe({
      next: ({ id, email, name, createdAt }) =>
        this.setUser({ id, email, name, createdAt }),
      error: () => this.logout(),
    });
  }

  logout(): void {
    this.api.logout();
    this.user.set(null);
    this.storage.removeItem(USER_KEY);
    void this.router.navigateByUrl('/auth/login');
  }

  private setUser(user: AuthUser): void {
    this.user.set(user);
    void this.storage.setItem(USER_KEY, JSON.stringify(user));
  }
}
