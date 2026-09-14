import { PaginationQuery } from '@foundry/shared-util';
import { PortalUser } from '../portal-users/portal-user.models';
import { Project } from '../projects';

export interface ClientPortal {
  id: string;
  slug: string;
  active: boolean;
  updatedAt: Date;
  createdAt: Date;
  clientId: string;
  permission: PortalPermission | undefined;
  clientPortalProjects: PortalProject[];
  clientPortalUsers: PortalUser[];
}

export interface PortalProject {
  id: string;
  clientPortalId: string;
  active: boolean;
  project: Project;
  updatedAt: Date;
  createdAt: Date;
}

export interface PortalPermission {
  id: string;
  viewProjects: boolean;
  viewDocuments: boolean;
  viewQuotes: boolean;
  viewPayments: boolean;
  updatedAt: Date;
  createdAt: Date;
}

export interface CreateClientPortalRequest {
  clientId: string;
  active?: boolean;
  viewProjects?: boolean;
  viewDocuments?: boolean;
  viewQuotes?: boolean;
  viewPayments?: boolean;
}

export type UpdateClientPortalRequest = Partial<CreateClientPortalRequest>;

export interface ListClientPortalQuery extends PaginationQuery {
  clientId?: string;
  active?: boolean;
}
