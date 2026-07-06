import { PLATFORM_ID, inject } from '@angular/core';
import { isPlatformServer } from '@angular/common';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/**
 * Auth state lives in localStorage, which the server can't read — SSR
 * renders optimistically and the client re-runs the guard on hydration.
 */
export const authGuard: CanActivateFn = () => {
  if (isPlatformServer(inject(PLATFORM_ID))) return true;
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.authenticated() ? true : router.parseUrl('/auth/login');
};

export const guestGuard: CanActivateFn = () => {
  if (isPlatformServer(inject(PLATFORM_ID))) return true;
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.authenticated() ? router.parseUrl('/') : true;
};

/** The OTP screen only makes sense mid-login (after credentials were entered). */
export const otpGuard: CanActivateFn = () => {
  if (isPlatformServer(inject(PLATFORM_ID))) return true;
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.pendingEmail() ? true : router.parseUrl('/auth/login');
};
