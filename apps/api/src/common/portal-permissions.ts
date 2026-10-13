/**
 * Client-portal view permissions. A workspace holds the defaults
 * (portalView* columns); each ClientPortal's PortalPermission follows them
 * while `inherit` is true and uses its own view* flags once it is false.
 * Everything that enforces or reports a portal's permissions goes through
 * effectivePortalPermission() so the two can't drift.
 */
export const PORTAL_PERMISSION_FLAGS = [
  'viewProjects',
  'viewDocuments',
  'viewQuotes',
  'viewPayments',
] as const;

export type PortalPermissionFlag = (typeof PORTAL_PERMISSION_FLAGS)[number];
export type PortalPermissionFlags = Record<PortalPermissionFlag, boolean>;

export interface WorkspacePortalDefaults {
  portalViewProjects: boolean;
  portalViewDocuments: boolean;
  portalViewQuotes: boolean;
  portalViewPayments: boolean;
}

/** Prisma `select` for the workspace columns that hold the defaults. */
export const WORKSPACE_PORTAL_DEFAULTS_SELECT = {
  portalViewProjects: true,
  portalViewDocuments: true,
  portalViewQuotes: true,
  portalViewPayments: true,
} as const;

export function workspacePortalDefaults(
  workspace: WorkspacePortalDefaults,
): PortalPermissionFlags {
  return {
    viewProjects: workspace.portalViewProjects,
    viewDocuments: workspace.portalViewDocuments,
    viewQuotes: workspace.portalViewQuotes,
    viewPayments: workspace.portalViewPayments,
  };
}

/** What a portal can actually see: the workspace defaults, or its own flags when it has opted out of them. */
export function effectivePortalPermission(
  permission: PortalPermissionFlags & { inherit: boolean },
  workspace: WorkspacePortalDefaults,
): PortalPermissionFlags {
  if (permission.inherit) return workspacePortalDefaults(workspace);
  return {
    viewProjects: permission.viewProjects,
    viewDocuments: permission.viewDocuments,
    viewQuotes: permission.viewQuotes,
    viewPayments: permission.viewPayments,
  };
}
