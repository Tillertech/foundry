import { PaginationQuery } from '../../core/http/api.types';
import { ClientStatus, Currency } from '../shared/models';

export interface ApiClient {
  id: string;
  name: string;
  email: string;
  company: string | null;
  currency: Currency;
  status: ClientStatus;
  phone: string | null;
  taxId: string | null;
  address: string | null;
  notes: string | null;
  workspaceId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateClientRequest {
  name: string;
  email: string;
  company?: string;
  currency?: Currency;
  status?: ClientStatus;
  phone?: string;
  taxId?: string;
  address?: string;
  notes?: string;
  workspaceId?: string;
}

export type UpdateClientRequest = Partial<
  Omit<CreateClientRequest, 'workspaceId'>
>;

export interface ListClientsQuery extends PaginationQuery {
  workspaceId?: string;
  status?: ClientStatus;
  search?: string;
}
