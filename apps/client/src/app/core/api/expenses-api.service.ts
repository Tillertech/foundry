import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE, toParams } from './api-base';
import {
  CreateExpenseRequest,
  Expense,
  ListExpensesQuery,
  PaginatedResponse,
  UpdateExpenseRequest,
} from './api.models';

@Injectable({ providedIn: 'root' })
export class ExpensesApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${API_BASE}/expenses`;

  create(body: CreateExpenseRequest): Observable<Expense> {
    return this.http.post<Expense>(this.base, body);
  }

  list(query?: ListExpensesQuery): Observable<PaginatedResponse<Expense>> {
    return this.http.get<PaginatedResponse<Expense>>(this.base, {
      params: toParams(query as Record<string, unknown>),
    });
  }

  get(id: string): Observable<Expense> {
    return this.http.get<Expense>(`${this.base}/${id}`);
  }

  update(id: string, body: UpdateExpenseRequest): Observable<Expense> {
    return this.http.patch<Expense>(`${this.base}/${id}`, body);
  }

  delete(id: string): Observable<Expense> {
    return this.http.delete<Expense>(`${this.base}/${id}`);
  }
}
