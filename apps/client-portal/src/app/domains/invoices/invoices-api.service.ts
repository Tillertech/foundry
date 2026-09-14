import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  API_BASE,
  toParams,
  PaginatedResponse,
  PaginationQuery,
} from '@foundry/shared-util';
import { Invoice } from './invoice.models';

@Injectable({ providedIn: 'root' })
export class InvoicesApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${API_BASE}/portal/invoices`;

  list(query?: PaginationQuery): Observable<PaginatedResponse<Invoice>> {
    return this.http.get<PaginatedResponse<Invoice>>(this.base, {
      params: toParams(query as Record<string, unknown>),
    });
  }

  get(id: string): Observable<Invoice> {
    return this.http.get<Invoice>(`${this.base}/${id}`);
  }

  /** Filename is derived client-side from the invoice number rather than
   * parsed off Content-Disposition - simpler, and callers already have it. */
  download(id: string): Observable<Blob> {
    return this.http.get(`${this.base}/${id}/download`, {
      responseType: 'blob',
    });
  }
}
