import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  API_BASE,
  toParams,
  PaginatedResponse,
  PaginationQuery,
} from '@foundry/shared-util';
import { Quote } from './quote.models';

@Injectable({ providedIn: 'root' })
export class QuotesApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${API_BASE}/portal/quotes`;

  list(query?: PaginationQuery): Observable<PaginatedResponse<Quote>> {
    return this.http.get<PaginatedResponse<Quote>>(this.base, {
      params: toParams(query as Record<string, unknown>),
    });
  }

  get(id: string): Observable<Quote> {
    return this.http.get<Quote>(`${this.base}/${id}`);
  }
}
