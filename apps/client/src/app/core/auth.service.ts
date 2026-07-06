import { Injectable, computed, signal } from '@angular/core';
import { Router } from '@angular/router';
import { inject } from '@angular/core';

export interface User {
  name: string;
  email: string;
}

const KEY = 'ledger.auth.v1';

/**
 * Placeholder auth: any email/password signs in. Swap for a real
 * backend (e.g. the api app) when authentication lands server-side.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly router = inject(Router);

  readonly user = signal<User | null>(this.load());
  readonly authenticated = computed(() => this.user() !== null);
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

  /** Email awaiting OTP verification (set by login, cleared by verifyOtp). */
  readonly pendingEmail = signal<string | null>(null);

  private load(): User | null {
    if (typeof localStorage === 'undefined') return null;
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? (JSON.parse(raw) as User) : null;
    } catch {
      return null;
    }
  }

  /** Step 1: credentials accepted → an OTP is "sent" and must be verified. */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  login(email: string, _password: string): void {
    this.pendingEmail.set(email);
  }

  /** Step 2: any 6-digit code completes sign-in in this demo. */
  verifyOtp(code: string): boolean {
    const email = this.pendingEmail();
    if (!email || !/^\d{6}$/.test(code)) return false;
    const name = email
      .split('@')[0]
      .split(/[._-]/)
      .filter(Boolean)
      .map((s) => s[0].toUpperCase() + s.slice(1))
      .join(' ');
    const user: User = { name: name || 'Mika', email };
    this.user.set(user);
    this.pendingEmail.set(null);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(KEY, JSON.stringify(user));
    }
    return true;
  }

  logout(): void {
    this.user.set(null);
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(KEY);
    }
    void this.router.navigateByUrl('/auth/login');
  }
}
