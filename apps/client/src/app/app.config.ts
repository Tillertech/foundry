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
} from '@angular/common/http';
import { authInterceptor } from './domains/auth/auth.interceptor';
import {
  BrnNativeDateAdapter,
  provideDateAdapter,
} from '@spartan-ng/brain/date-time';
import { appRoutes } from './app.routes';
import {
  provideClientHydration,
  withEventReplay,
} from '@angular/platform-browser';

export const appConfig: ApplicationConfig = {
  providers: [
    provideClientHydration(withEventReplay()),
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(
      appRoutes,
      withComponentInputBinding(),
      withViewTransitions(),
    ),
    provideHttpClient(withFetch(), withInterceptors([authInterceptor])),
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
