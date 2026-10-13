import { PaginationQuery, PortalUserStatus } from '@foundry/shared-util';

export interface PortalUser {
  id: string;
  email: string;
  name: string;
  emailVerifiedAt: string | null;
  status: PortalUserStatus;
  /** true: every project shared into the portal. false: only `projectIds`. */
  allProjects: boolean;
  /** Projects the user is limited to; empty while `allProjects` is true. */
  projectIds: string[];
  clientPortalId: string;
  createdAt: string;
  updatedAt: string;
}

/** Project access shared by invite and update. */
export interface PortalUserAccess {
  /** Defaults to true on invite: inherit the portal's project sharing. */
  allProjects?: boolean;
  /** Required (non-empty) when `allProjects` is false. */
  projectIds?: string[];
}

export interface CreatePortalUserRequest extends PortalUserAccess {
  clientPortalId: string;
  email: string;
  name: string;
}

export interface UpdatePortalUserRequest extends PortalUserAccess {
  email?: string;
  name?: string;
  /** Suspend or reactivate; an invited user cannot be activated this way. */
  status?: 'active' | 'suspended';
}

export interface ListPortalUserQuery extends PaginationQuery {
  clientPortalId?: string;
  status?: PortalUserStatus;
}
