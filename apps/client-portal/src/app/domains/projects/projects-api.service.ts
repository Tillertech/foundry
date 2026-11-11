import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  API_BASE,
  toParams,
  PaginatedResponse,
  PaginationQuery,
} from '@foundry/shared-util';
import {
  Project,
  ProjectFinancials,
  ProjectMilestone,
  ReviewMilestoneRequest,
} from './project.models';

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

  /** Approve or request changes on a delivered milestone. */
  reviewMilestone(
    projectId: string,
    milestoneId: string,
    body: ReviewMilestoneRequest,
  ): Observable<void> {
    return this.http.post<void>(
      `${this.base}/${projectId}/milestones/${milestoneId}/review`,
      body,
    );
  }

  /** Budget, invoiced, paid, outstanding... - needs the payments permission too. */
  financials(id: string): Observable<ProjectFinancials> {
    return this.http.get<ProjectFinancials>(`${this.base}/${id}/financials`);
  }

  /** One milestone of a shared project - for swapping a single live change in. */
  getMilestone(
    projectId: string,
    milestoneId: string,
  ): Observable<ProjectMilestone> {
    return this.http.get<ProjectMilestone>(
      `${this.base}/${projectId}/milestones/${milestoneId}`,
    );
  }
}
