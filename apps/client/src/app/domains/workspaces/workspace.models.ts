import { ClientStatus, Currency } from '../shared/models';

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  currency: Currency;
  status: ClientStatus;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateWorkspaceRequest {
  name: string;
  currency?: Currency;
  status?: ClientStatus;
}

export type UpdateWorkspaceRequest = Partial<CreateWorkspaceRequest>;
