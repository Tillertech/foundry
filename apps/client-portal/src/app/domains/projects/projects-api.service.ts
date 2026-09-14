import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  API_BASE,
  toParams,
  PaginatedResponse,
  PaginationQuery,
} from '@foundry/shared-util';
import { Project } from './project.models';

@Injectable({ providedIn: 'root' })
export class ProjectsApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${API_BASE}/portal/projects`;

  list(query?: PaginationQuery): Observable<PaginatedResponse<Project>> {
    return this.http.get<PaginatedResponse<Project>>(this.base, {
      params: toParams(query as Record<string, unknown>),
    });
  }

  get(id: string): Observable<Project> {
    return this.http.get<Project>(`${this.base}/${id}`);
  }
}
