import { PaginationQuery } from '@foundry/shared-util';
import { PortalUser } from '../portal-users/portal-user.models';
import { ProjectStatus } from '../projects';

/** The four areas a client portal can show - all the portal API enforces. */
export interface PortalPermissionFlags {
  viewProjects: boolean;
  viewDocuments: boolean;
  viewQuotes: boolean;
  /** Gates both invoices and payments. */
  viewPayments: boolean;
}

export interface PortalPermission extends PortalPermissionFlags {
  id: string;
  /** While true the portal follows the workspace defaults and its own flags are ignored. */
  inherit: boolean;
  updatedAt: string;
  createdAt: string;
}

export interface PortalProject {
  /** Id of the share itself, not the project. */
  id: string;
  active: boolean;
  project: { id: string; name: string; status: ProjectStatus };
}

export interface ClientPortal {
  id: string;
  slug: string;
  active: boolean;
  updatedAt: string;
  createdAt: string;
  clientId: string;
  permission: PortalPermission | undefined;
  /** What the portal can actually see: workspace defaults while inheriting, its own flags otherwise. */
  effectivePermission: PortalPermissionFlags;
  clientPortalProjects: PortalProject[];
  clientPortalUsers: PortalUser[];
}

export interface CreateClientPortalRequest {
  clientId: string;
}

export interface UpdateClientPortalRequest extends Partial<PortalPermissionFlags> {
  active?: boolean;
  /** true: follow the workspace defaults. false: use the view flags sent/stored on this portal. */
  inheritPermissions?: boolean;
}

export interface ListClientPortalQuery extends PaginationQuery {
  clientId?: string;
  active?: boolean;
}
