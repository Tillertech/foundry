import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { PortalAuthService } from './portal-auth.service';
import { PortalPermission } from './portal-auth.models';

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
 * visitor is sent to their own portal rather than re-shown a login form.
 * The same person can belong to several clients' portals, so another
 * portal's login or invite link still opens - signing in there replaces the
 * current session. */
export const guestGuard: CanActivateFn = (route) => {
  const auth = inject(PortalAuthService);
  const router = inject(Router);
  if (!auth.authenticated()) return true;
  const slug = auth.slug();
  const routeSlug = route.paramMap.get('slug');
  if (slug && routeSlug && routeSlug !== slug) return true;
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

/**
 * Keeps a section the portal doesn't show (Documents, Quotes, ...) from
 * opening by URL: the nav already hides it, but a bookmark or old link would
 * otherwise render the API's 403 as an empty list. Re-reads `/me` so a
 * permission the workspace just changed applies without a reload.
 */
export const permissionGuard =
  (flag: keyof PortalPermission): CanActivateFn =>
  async (route) => {
    const auth = inject(PortalAuthService);
    const router = inject(Router);
    await auth.refresh();
    const me = auth.me();
    const slug = route.paramMap.get('slug') ?? auth.slug() ?? '';
    if (!me) return router.parseUrl(`/${slug}/login`);
    return me.clientPortal.permission[flag]
      ? true
      : router.parseUrl(`/${me.clientPortal.slug}`);
  };
