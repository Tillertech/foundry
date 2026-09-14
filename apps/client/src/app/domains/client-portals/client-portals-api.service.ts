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

@Injectable({ providedIn: 'root' })
export class ClientPortalApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${API_BASE}/client-portal`;

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
}
