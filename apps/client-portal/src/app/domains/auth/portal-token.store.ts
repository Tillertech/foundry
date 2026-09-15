import { Injectable, signal } from '@angular/core';

const TOKEN_KEY = 'foundry.portal.t';
const SLUG_KEY = 'foundry.portal.slug';

/**
 * Holds the JWT used by the auth interceptor, plus the slug this session's
 * portal is reached at (/:slug/...) - kept alongside the token so a reload or
 * a bare `/` visit can restore the right URL without waiting on `/me`. Plain
 * localStorage (not encrypted like the main app's ApiTokenStore) - a
 * reasonable scope trim for this app; revisit if that ever needs to change.
 */
@Injectable({ providedIn: 'root' })
export class PortalTokenStore {
  readonly token = signal<string | null>(restore(TOKEN_KEY));
  readonly slug = signal<string | null>(restore(SLUG_KEY));

  set(token: string, slug: string): void {
    this.token.set(token);
    this.slug.set(slug);
    try {
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(SLUG_KEY, slug);
    } catch {
      /* private browsing / storage disabled - session just won't persist */
    }
  }

  /** Updates the remembered slug without touching the token (e.g. after `/me`). */
  setSlug(slug: string): void {
    this.slug.set(slug);
    try {
      localStorage.setItem(SLUG_KEY, slug);
    } catch {
      /* noop */
    }
  }

  clear(): void {
    this.token.set(null);
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* noop */
    }
    // The slug is kept even after logout, so signing out and landing back on
    // "/" still redirects to this portal's own login instead of a dead end.
  }
}

function restore(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
