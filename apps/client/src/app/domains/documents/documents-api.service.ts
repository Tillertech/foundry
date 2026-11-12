import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { API_BASE, toParams, PaginatedResponse } from '@foundry/shared-util';
import {
  ApiDocument,
  CreateDocumentRequest,
  ListDocumentsQuery,
  UpdateDocumentRequest,
} from './document.models';

export const DOCUMENT_MAX_BYTES = 25 * 1024 * 1024;

@Injectable({ providedIn: 'root' })
export class DocumentsApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${API_BASE}/documents`;

  /** Uploads the file and registers the document in one multipart call. */
  create(
    file: File,
    meta: CreateDocumentRequest = {},
  ): Observable<ApiDocument> {
    if (file.size > DOCUMENT_MAX_BYTES) {
      return throwError(
        () =>
          new HttpErrorResponse({
            status: 413,
            statusText: 'Payload Too Large',
            error: { message: 'Files must be 25MB or smaller' },
          }),
      );
    }
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

  /** The stored file's bytes, for downloads and inline previews. */
  download(id: string): Observable<Blob> {
    return this.http.get(`${this.base}/${id}/download`, {
      responseType: 'blob',
    });
  }

  preview(id: string): Observable<Blob> {
    return this.http.get(`${this.base}/${id}/preview`, {
      responseType: 'blob',
    });
  }

  /** Emails the document to its linked client as an attachment. */
  share(id: string): Observable<ApiDocument> {
    return this.http.post<ApiDocument>(`${this.base}/${id}/share`, {});
  }
}
