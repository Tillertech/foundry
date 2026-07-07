import { PaginationQuery } from '../../core/http/api.types';

export type ProjectStatus = 'planning' | 'active' | 'on_hold' | 'completed';

export interface Project {
  id: string;
  name: string;
  status: ProjectStatus;
  budget: string;
  hourlyRate: string | null;
  startDate: string;
  endDate: string | null;
  description: string | null;
  clientId: string;
}

export interface CreateProjectRequest {
  name: string;
  clientId: string;
  status?: ProjectStatus;
  budget?: number;
  hourlyRate?: number;
  startDate: string;
  endDate?: string;
  description?: string;
}

export type UpdateProjectRequest = Partial<
  Omit<CreateProjectRequest, 'clientId'>
>;

export interface ListProjectsQuery extends PaginationQuery {
  clientId?: string;
  status?: ProjectStatus;
}
