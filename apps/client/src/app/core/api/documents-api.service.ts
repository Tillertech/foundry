import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE, toParams } from './api-base';
import {
  ApiDocument,
  CreateDocumentRequest,
  ListDocumentsQuery,
  PaginatedResponse,
  StoredFile,
  UpdateDocumentRequest,
} from './api.models';

@Injectable({ providedIn: 'root' })
export class DocumentsApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${API_BASE}/documents`;
  private readonly uploadsBase = `${API_BASE}/uploads`;

  /** Step 1: upload the binary; returns the storage key/url. */
  uploadFile(file: File): Observable<StoredFile> {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<StoredFile>(this.uploadsBase, form);
  }

  /** Step 2: register the document metadata against the storage key. */
  create(body: CreateDocumentRequest): Observable<ApiDocument> {
    return this.http.post<ApiDocument>(this.base, body);
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
