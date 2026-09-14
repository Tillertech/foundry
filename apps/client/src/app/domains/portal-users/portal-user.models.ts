import { PaginationQuery, PortalUserStatus } from '@foundry/shared-util';

export interface PortalUser {
  id: string;
  email: string;
  name: string;
  emailVerifiedAt: string | undefined;
  status: PortalUserStatus;
  clientPortalId: string;
  createdAt: string;
  updatedAt: string;
}
export interface CreatePortalUserRequest {
  email: string;
  name: string;
}

export type UpdatePortalUserRequest = Partial<CreatePortalUserRequest>;
// todo: add status

export interface ListPortalUserQuery extends PaginationQuery {
  clientPortalId?: string;
  status?: PortalUserStatus;
}
