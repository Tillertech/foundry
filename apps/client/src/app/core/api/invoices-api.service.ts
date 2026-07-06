import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE, toParams } from './api-base';
import {
  CreateInvoiceRequest,
  Invoice,
  ListInvoicesQuery,
  PaginatedResponse,
  UpdateInvoiceRequest,
} from './api.models';

@Injectable({ providedIn: 'root' })
export class InvoicesApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${API_BASE}/invoices`;

  create(body: CreateInvoiceRequest): Observable<Invoice> {
    return this.http.post<Invoice>(this.base, body);
  }

  list(query?: ListInvoicesQuery): Observable<PaginatedResponse<Invoice>> {
    return this.http.get<PaginatedResponse<Invoice>>(this.base, {
      params: toParams(query as Record<string, unknown>),
    });
  }

  get(id: string): Observable<Invoice> {
    return this.http.get<Invoice>(`${this.base}/${id}`);
  }

  /** Items, when provided, replace the existing line items. */
  update(id: string, body: UpdateInvoiceRequest): Observable<Invoice> {
    return this.http.patch<Invoice>(`${this.base}/${id}`, body);
  }

  delete(id: string): Observable<Invoice> {
    return this.http.delete<Invoice>(`${this.base}/${id}`);
  }

  /** Marks the invoice sent and emails it (with PDF) to the client. */
  send(id: string): Observable<Invoice> {
    return this.http.post<Invoice>(`${this.base}/${id}/send`, {});
  }
}
