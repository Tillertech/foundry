import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { PortalAuthService } from './portal-auth.service';

/** Guards the authenticated shell (`/:slug/...`) - also corrects the URL's
 * slug segment if it doesn't match the signed-in user's actual portal. */
export const authGuard: CanActivateFn = (route, state) => {
  const auth = inject(PortalAuthService);
  const router = inject(Router);
  const routeSlug = route.paramMap.get('slug') ?? '';

  if (!auth.authenticated()) {
    return router.parseUrl(`/${routeSlug || auth.slug() || ''}/login`);
  }

  const actualSlug = auth.slug();
  if (actualSlug && routeSlug !== actualSlug) {
    const segments = state.url.split('/');
    segments[1] = actualSlug; // ['', ':slug', ...rest] - swap only the slug.
    return router.parseUrl(segments.join('/'));
  }
  return true;
};

/** Guards the pre-auth pages (login, accept-invite): an already-authenticated
 * visitor is sent to their own portal rather than re-shown a login form. */
export const guestGuard: CanActivateFn = () => {
  const auth = inject(PortalAuthService);
  const router = inject(Router);
  if (!auth.authenticated()) return true;
  const slug = auth.slug();
  return router.parseUrl(slug ? `/${slug}` : '/');
};

/** Guards the slug-less root (`/`) and any unmatched URL: if we already know
 * which portal this browser belongs to, go straight there. */
export const rootRedirectGuard: CanActivateFn = () => {
  const auth = inject(PortalAuthService);
  const router = inject(Router);
  const slug = auth.slug();
  return slug ? router.parseUrl(`/${slug}`) : true;
};
