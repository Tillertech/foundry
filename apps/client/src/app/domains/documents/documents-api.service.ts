import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE, toParams } from '../../core/http/api-base';
import { PaginatedResponse } from '../../core/http/api.types';
import {
  ApiDocument,
  CreateDocumentRequest,
  ListDocumentsQuery,
  UpdateDocumentRequest,
} from './document.models';

@Injectable({ providedIn: 'root' })
export class DocumentsApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${API_BASE}/documents`;

  /** Uploads the file and registers the document in one multipart call. */
  create(file: File, meta: CreateDocumentRequest = {}): Observable<ApiDocument> {
    const form = new FormData();
    form.append('file', file);
    for (const [key, value] of Object.entries(meta)) {
      if (value !== undefined && value !== null && value !== '') {
        form.append(key, String(value));
      }
    }
    return this.http.post<ApiDocument>(this.base, form);
  }

  list(query?: ListDocumentsQuery): Observable<PaginatedResponse<ApiDocument>> {
    return this.http.get<PaginatedResponse<ApiDocument>>(this.base, {
      params: toParams(query as Record<string, unknown>),
    });
  }

  get(id: string): Observable<ApiDocument> {
    return this.http.get<ApiDocument>(`${this.base}/${id}`);
  }

  update(id: string, body: UpdateDocumentRequest): Observable<ApiDocument> {
    return this.http.patch<ApiDocument>(`${this.base}/${id}`, body);
  }

  /** Removes the metadata record and the stored file. */
  delete(id: string): Observable<ApiDocument> {
    return this.http.delete<ApiDocument>(`${this.base}/${id}`);
  }
}
