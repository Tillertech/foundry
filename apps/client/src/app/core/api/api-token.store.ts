import { Injectable, signal } from '@angular/core';

const TOKEN_KEY = 'foundry.token.v1';

/** Holds the JWT used by the auth interceptor; persisted to localStorage. */
@Injectable({ providedIn: 'root' })
export class ApiTokenStore {
  readonly token = signal<string | null>(this.load());

  set(token: string): void {
    this.token.set(token);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(TOKEN_KEY, token);
    }
  }

  clear(): void {
    this.token.set(null);
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(TOKEN_KEY);
    }
  }

  private load(): string | null {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(TOKEN_KEY);
  }
}
