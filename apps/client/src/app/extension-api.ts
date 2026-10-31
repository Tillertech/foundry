/**
 * The stable surface for UI extensions (see EXTENDING.md). Anything exported
 * here keeps its contract across minor releases; a breaking change is called
 * out in the release notes. Import from this file rather than deep paths.
 */

// Booting the app with your routes and providers merged in.
export { App } from './app';
export { createAppConfig, type AppConfigExtensions } from './app.config';
export { buildAppRoutes, type AppRouteExtensions } from './app.routes';

// Slots, settings tabs and navigation entries.
export {
  FOUNDRY_SLOTS,
  FoundrySlot,
  NAV_ITEMS,
  SETTINGS_SECTIONS,
  provideNavItem,
  provideSettingsSection,
  provideSlot,
  slotComponents,
  type NavItem,
  type SettingsSection,
  type SlotName,
  type SlotRegistration,
} from './core/extensions';

// Session: who is signed in, and guards for your own routes.
export { AuthService, authGuard, guestGuard } from './domains/auth';

// Workspaces.
export {
  WorkspacesApiService,
  type CreateWorkspaceRequest,
  type UpdateWorkspaceRequest,
  type Workspace,
} from './domains/workspaces';
