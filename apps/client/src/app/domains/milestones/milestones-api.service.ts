import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import { API_BASE, toParams } from '@foundry/shared-util';
import {
  CreateMilestoneRequest,
  Milestone,
  ProjectMilestonesSummary,
  ReorderMilestonesRequest,
  UpdateMilestoneRequest,
} from './milestone.models';

@Injectable({ providedIn: 'root' })
export class MilestonesApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${API_BASE}/milestones`;

  /** A project's milestones, ordered by position - not paginated, it's a bounded reorderable list. */
  listForProject(projectId: string): Observable<Milestone[]> {
    return this.http.get<Milestone[]>(this.base, {
      params: toParams({ projectId }),
    });
  }

  /** Progress rollup for several projects in one call, for the listing page's cards. */
  summary(projectIds: string[]): Observable<ProjectMilestonesSummary[]> {
    if (!projectIds.length) return of([]);
    return this.http.get<ProjectMilestonesSummary[]>(`${this.base}/summary`, {
      params: toParams({ projectIds }),
    });
  }

  create(body: CreateMilestoneRequest): Observable<Milestone> {
    return this.http.post<Milestone>(this.base, body);
  }

  update(id: string, body: UpdateMilestoneRequest): Observable<Milestone> {
    return this.http.patch<Milestone>(`${this.base}/${id}`, body);
  }

  delete(id: string): Observable<Milestone> {
    return this.http.delete<Milestone>(`${this.base}/${id}`);
  }

  reorder(body: ReorderMilestonesRequest): Observable<Milestone[]> {
    return this.http.post<Milestone[]>(`${this.base}/reorder`, body);
  }
}
