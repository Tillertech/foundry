import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  API_BASE,
  toParams,
  PaginatedResponse,
  PaginationQuery,
} from '@foundry/shared-util';
import { DocumentItem } from './document.models';

@Injectable({ providedIn: 'root' })
export class DocumentsApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${API_BASE}/portal/documents`;

  list(query?: PaginationQuery): Observable<PaginatedResponse<DocumentItem>> {
    return this.http.get<PaginatedResponse<DocumentItem>>(this.base, {
      params: toParams(query as Record<string, unknown>),
    });
  }

  download(id: string): Observable<Blob> {
    return this.http.get(`${this.base}/${id}/download`, {
      responseType: 'blob',
    });
  }
}
