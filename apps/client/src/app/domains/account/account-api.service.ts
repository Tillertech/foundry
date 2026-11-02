import { HttpClient, HttpResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { API_BASE } from '@foundry/shared-util';
import { Observable } from 'rxjs';

export type AccountExportState = 'queued' | 'running' | 'ready' | 'failed' | 'expired';

/** One background export (apps/api/src/data-transfer/account-exports.service.ts). */
export interface AccountExport {
  id: string;
  state: AccountExportState;
  requestedAt: string;
  fileName?: string;
  bytes?: number;
  expiresAt?: string;
}

/** The API's /account endpoints (apps/api/src/data-transfer). */
@Injectable({ providedIn: 'root' })
export class AccountApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${API_BASE}/account/export`;

  /** Queues an export (or returns the one already running). */
  requestExport(): Observable<AccountExport> {
    return this.http.post<AccountExport>(this.base, {});
  }

  exportStatus(id: string): Observable<AccountExport> {
    return this.http.get<AccountExport>(`${this.base}/${encodeURIComponent(id)}`);
  }

  download(id: string): Observable<HttpResponse<Blob>> {
    return this.http.get(`${this.base}/${encodeURIComponent(id)}/download`, {
      responseType: 'blob',
      observe: 'response',
    });
  }
}

/** The file name the API suggested, or a sensible default. */
export function bundleFileName(res: HttpResponse<Blob>): string {
  const header = res.headers.get('content-disposition') ?? '';
  return /filename="([^"]+)"/.exec(header)?.[1] ?? 'foundry-account.foundry.ndjson.gz';
}
