import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE, PaginatedResponse, toParams } from '@foundry/shared-util';
import {
  CreatePortalUserRequest,
  PortalUser,
  UpdatePortalUserRequest,
} from './portal-user.models';
import { ListClientPortalQuery, ClientPortal } from '../client-portals';

@Injectable({ providedIn: 'root' })
export class PortalUsersApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${API_BASE}/client-user`;

  create(body: CreatePortalUserRequest): Observable<PortalUser> {
    return this.http.post<PortalUser>(`${this.base}`, body);
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

  update(id: string, body: UpdatePortalUserRequest): Observable<PortalUser> {
    return this.http.patch<PortalUser>(`${this.base}/${id}`, body);
  }
}
