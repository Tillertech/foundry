import {
  ApplicationConfig,
  inject,
  isDevMode,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
  provideZoneChangeDetection,
} from '@angular/core';
import { provideServiceWorker } from '@angular/service-worker';
import { AuthService } from './domains/auth';
import {
  provideRouter,
  withComponentInputBinding,
  withViewTransitions,
} from '@angular/router';
import {
  provideHttpClient,
  withFetch,
  withInterceptors,
  withInterceptorsFromDi,
} from '@angular/common/http';
import { authInterceptor } from './domains/auth/auth.interceptor';
import {
  BrnNativeDateAdapter,
  provideDateAdapter,
} from '@spartan-ng/brain/date-time';
import { AppRouteExtensions, buildAppRoutes } from './app.routes';

/** What an extension can contribute at bootstrap (see EXTENDING.md). */
export interface AppConfigExtensions {
  routes?: AppRouteExtensions;
}

/**
 * The app's configuration. Extensions pass their routes here and merge their
 * own providers on top with `mergeApplicationConfig`; class-based HTTP
 * interceptors they register under HTTP_INTERCEPTORS run after auth.
 */
export function createAppConfig(
  extensions: AppConfigExtensions = {},
): ApplicationConfig {
  return {
    providers: [
      provideBrowserGlobalErrorListeners(),
      provideZoneChangeDetection({ eventCoalescing: true }),
      provideRouter(
        buildAppRoutes(extensions.routes),
        withComponentInputBinding(),
        withViewTransitions(),
      ),
      provideHttpClient(
        withFetch(),
        withInterceptors([authInterceptor]),
        withInterceptorsFromDi(),
      ),
      provideDateAdapter(BrnNativeDateAdapter),
      // Rehydrate the encrypted session before the router (and its guards) run,
      // then re-sync the cached user against the API. No-ops on the server.
      provideAppInitializer(async () => {
        const auth = inject(AuthService);
        await auth.restore();
        auth.refresh();
      }),
      // ngsw registers only in the browser; disabled in dev so the SW cache
      // never masks live rebuilds. Waits for app stability to avoid delaying
      // first paint. ngsw-worker.js is emitted by the production build.
      provideServiceWorker('ngsw-worker.js', {
        enabled: !isDevMode(),
        registrationStrategy: 'registerWhenStable:30000',
      }),
    ],
  };
}

export const appConfig: ApplicationConfig = createAppConfig();
