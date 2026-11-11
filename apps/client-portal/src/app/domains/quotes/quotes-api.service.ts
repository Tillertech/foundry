import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  API_BASE,
  toParams,
  PaginatedResponse,
} from '@foundry/shared-util';
import { ListQuotesQuery, Quote } from './quote.models';

@Injectable({ providedIn: 'root' })
export class QuotesApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${API_BASE}/portal/quotes`;

  list(query?: ListQuotesQuery): Observable<PaginatedResponse<Quote>> {
    return this.http.get<PaginatedResponse<Quote>>(this.base, {
      params: toParams(query as Record<string, unknown>),
    });
  }

  get(id: string): Observable<Quote> {
    return this.http.get<Quote>(`${this.base}/${id}`);
  }

  /** Accepts a sent quote; `optionIds` = the options to include (others are left out). */
  accept(id: string, optionIds?: string[]): Observable<Quote> {
    return this.http.post<Quote>(`${this.base}/${id}/accept`, { optionIds });
  }

  /** The quote PDF - the document the quote mail attached. */
  downloadPdf(id: string): Observable<Blob> {
    return this.http.get(`${this.base}/${id}/download`, { responseType: 'blob' });
  }

  /** A file attached to the quote. */
  downloadAttachment(id: string, documentId: string): Observable<Blob> {
    return this.http.get(
      `${this.base}/${id}/attachments/${documentId}/download`,
      { responseType: 'blob' },
    );
  }

  decline(id: string, reason?: string): Observable<Quote> {
    return this.http.post<Quote>(`${this.base}/${id}/decline`, { reason });
  }
}
