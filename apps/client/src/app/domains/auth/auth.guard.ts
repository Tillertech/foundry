import { PLATFORM_ID, inject } from '@angular/core';
import { isPlatformServer } from '@angular/common';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/**
 * Session state lives in browser storage, which the server can't read —
 * SSR renders optimistically and the client re-runs the guard on
 * hydration, after the app initializer has restored the session.
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
