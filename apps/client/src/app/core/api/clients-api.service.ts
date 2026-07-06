import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE, toParams } from './api-base';
import {
  ApiClient,
  CreateClientRequest,
  ListClientsQuery,
  PaginatedResponse,
  UpdateClientRequest,
} from './api.models';

@Injectable({ providedIn: 'root' })
export class ClientsApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${API_BASE}/clients`;

  create(body: CreateClientRequest): Observable<ApiClient> {
    return this.http.post<ApiClient>(this.base, body);
  }

  list(query?: ListClientsQuery): Observable<PaginatedResponse<ApiClient>> {
    return this.http.get<PaginatedResponse<ApiClient>>(this.base, {
      params: toParams(query as Record<string, unknown>),
    });
  }

  get(id: string): Observable<ApiClient> {
    return this.http.get<ApiClient>(`${this.base}/${id}`);
  }

  update(id: string, body: UpdateClientRequest): Observable<ApiClient> {
    return this.http.patch<ApiClient>(`${this.base}/${id}`, body);
  }

  delete(id: string): Observable<ApiClient> {
    return this.http.delete<ApiClient>(`${this.base}/${id}`);
  }
}
