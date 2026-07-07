import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE, toParams } from '../../core/http/api-base';
import { PaginatedResponse } from '../../core/http/api.types';
import {
  CreateProjectRequest,
  ListProjectsQuery,
  Project,
  UpdateProjectRequest,
} from './project.models';

@Injectable({ providedIn: 'root' })
export class ProjectsApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${API_BASE}/projects`;

  create(body: CreateProjectRequest): Observable<Project> {
    return this.http.post<Project>(this.base, body);
  }

  list(query?: ListProjectsQuery): Observable<PaginatedResponse<Project>> {
    return this.http.get<PaginatedResponse<Project>>(this.base, {
      params: toParams(query as Record<string, unknown>),
    });
  }

  get(id: string): Observable<Project> {
    return this.http.get<Project>(`${this.base}/${id}`);
  }

  update(id: string, body: UpdateProjectRequest): Observable<Project> {
    return this.http.patch<Project>(`${this.base}/${id}`, body);
  }

  delete(id: string): Observable<Project> {
    return this.http.delete<Project>(`${this.base}/${id}`);
  }
}
