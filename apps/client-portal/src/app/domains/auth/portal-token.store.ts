import { Injectable, signal } from '@angular/core';

const TOKEN_KEY = 'foundry.portal.t';

/**
 * Holds the JWT used by the auth interceptor. Plain localStorage (not
 * encrypted like the main app's ApiTokenStore) - a reasonable scope trim for
 * this app; revisit if that ever needs to change.
 */
@Injectable({ providedIn: 'root' })
export class PortalTokenStore {
  readonly token = signal<string | null>(restore());

  set(token: string): void {
    this.token.set(token);
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      /* private browsing / storage disabled - session just won't persist */
    }
  }

  clear(): void {
    this.token.set(null);
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* noop */
    }
  }
}

function restore(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}
