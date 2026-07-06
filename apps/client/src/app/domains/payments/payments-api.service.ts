import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE, toParams } from '../../core/http/api-base';
import { PaginatedResponse } from '../../core/http/api.types';
import {
  CreatePaymentRequest,
  ListPaymentsQuery,
  Payment,
  UpdatePaymentRequest,
} from './payment.models';

@Injectable({ providedIn: 'root' })
export class PaymentsApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${API_BASE}/payments`;

  create(body: CreatePaymentRequest): Observable<Payment> {
    return this.http.post<Payment>(this.base, body);
  }

  list(query?: ListPaymentsQuery): Observable<PaginatedResponse<Payment>> {
    return this.http.get<PaginatedResponse<Payment>>(this.base, {
      params: toParams(query as Record<string, unknown>),
    });
  }

  get(id: string): Observable<Payment> {
    return this.http.get<Payment>(`${this.base}/${id}`);
  }

  update(id: string, body: UpdatePaymentRequest): Observable<Payment> {
    return this.http.patch<Payment>(`${this.base}/${id}`, body);
  }

  delete(id: string): Observable<Payment> {
    return this.http.delete<Payment>(`${this.base}/${id}`);
  }
}
