import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE, toParams } from '../../core/http/api-base';
import { PaginatedResponse } from '../../core/http/api.types';
import {
  CreateQuoteRequest,
  ListQuotesQuery,
  Quote,
  UpdateQuoteRequest,
} from './quote.models';

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

  /** Marks the quote sent and emails it (with PDF) to the client. */
  send(id: string): Observable<Quote> {
    return this.http.post<Quote>(`${this.base}/${id}/send`, {});
  }
}
