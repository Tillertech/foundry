import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE } from '../../core/http/api-base';
import {
  CreateWorkspaceRequest,
  UpdateWorkspaceRequest,
  Workspace,
} from './workspace.models';

@Injectable({ providedIn: 'root' })
export class WorkspacesApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${API_BASE}/workspaces`;

  create(body: CreateWorkspaceRequest): Observable<Workspace> {
    return this.http.post<Workspace>(this.base, body);
  }

  /** Oldest first; the first entry is the default workspace. */
  list(): Observable<Workspace[]> {
    return this.http.get<Workspace[]>(this.base);
  }

  getDefault(): Observable<Workspace> {
    return this.http.get<Workspace>(`${this.base}/default`);
  }

  get(id: string): Observable<Workspace> {
    return this.http.get<Workspace>(`${this.base}/${id}`);
  }

  update(id: string, body: UpdateWorkspaceRequest): Observable<Workspace> {
    return this.http.patch<Workspace>(`${this.base}/${id}`, body);
  }

  delete(id: string): Observable<Workspace> {
    return this.http.delete<Workspace>(`${this.base}/${id}`);
  }
}
