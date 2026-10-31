import { Injectable, signal } from '@angular/core';

/**
 * Mock, client-side-only state for the parts of the Client Portal settings
 * screen that have no backend yet: the workspace-wide on/off switch and the
 * branding fields. Nothing here is persisted.
 *
 * Default permissions, project sharing and portal users are NOT here - those
 * are real and go through the workspaces, client-portal and portal-users
 * APIs.
 */
@Injectable({ providedIn: 'root' })
export class PortalSettingsStore {
  readonly enabled = signal(true);
  readonly slug = signal('acme-studio');
  readonly welcomeMessage = signal(
    'Welcome to your client portal. Track projects and find your quotes, invoices and documents - all in one place.',
  );

  setEnabled(enabled: boolean): void {
    this.enabled.set(enabled);
  }

  setSlug(slug: string): void {
    this.slug.set(slug);
  }

  setWelcomeMessage(message: string): void {
    this.welcomeMessage.set(message);
  }
}
