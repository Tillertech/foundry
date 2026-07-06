import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE, toParams } from './api-base';
import {
  CreateQuoteRequest,
  ListQuotesQuery,
  PaginatedResponse,
  Quote,
  UpdateQuoteRequest,
} from './api.models';

@Injectable({ providedIn: 'root' })
export class QuotesApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${API_BASE}/quotes`;

  create(body: CreateQuoteRequest): Observable<Quote> {
    return this.http.post<Quote>(this.base, body);
  }

  list(query?: ListQuotesQuery): Observable<PaginatedResponse<Quote>> {
    return this.http.get<PaginatedResponse<Quote>>(this.base, {
      params: toParams(query as Record<string, unknown>),
    });
  }

  get(id: string): Observable<Quote> {
    return this.http.get<Quote>(`${this.base}/${id}`);
  }

  /** Items, when provided, replace the existing line items. */
  update(id: string, body: UpdateQuoteRequest): Observable<Quote> {
    return this.http.patch<Quote>(`${this.base}/${id}`, body);
  }

  delete(id: string): Observable<Quote> {
    return this.http.delete<Quote>(`${this.base}/${id}`);
  }
}
