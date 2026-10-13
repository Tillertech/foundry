import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { API_BASE, PaginatedResponse, toParams } from '@foundry/shared-util';
import {
  ClientPortal,
  CreateClientPortalRequest,
  ListClientPortalQuery,
  UpdateClientPortalRequest,
} from './client-portal.models';
import { Observable } from 'rxjs';

/**
 * Workspace-owner admin of client portals. Every call answers with the whole
 * portal (permission, users, project shares), so callers replace their copy
 * rather than patching it.
 */
@Injectable({ providedIn: 'root' })
export class ClientPortalApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${API_BASE}/client-portal`;

  /** Provisions the client's portal, or returns the one it already has. */
  create(body: CreateClientPortalRequest): Observable<ClientPortal> {
    return this.http.post<ClientPortal>(this.base, body);
  }
  list(
    query?: ListClientPortalQuery,
  ): Observable<PaginatedResponse<ClientPortal>> {
    return this.http.get<PaginatedResponse<ClientPortal>>(this.base, {
      params: toParams(query as Record<string, unknown>),
    });
  }
  get(id: string): Observable<ClientPortal> {
    return this.http.get<ClientPortal>(`${this.base}/${id}`);
  }
  update(
    id: string,
    body: UpdateClientPortalRequest,
  ): Observable<ClientPortal> {
    return this.http.patch<ClientPortal>(`${this.base}/${id}`, body);
  }
  /** Shares one of the client's projects into the portal, or hides it again. */
  shareProject(
    id: string,
    projectId: string,
    active: boolean,
  ): Observable<ClientPortal> {
    return this.http.patch<ClientPortal>(
      `${this.base}/${id}/projects/${projectId}`,
      { active },
    );
  }
}
