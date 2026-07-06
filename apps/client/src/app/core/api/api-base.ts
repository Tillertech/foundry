import { HttpParams } from '@angular/common/http';

/** Proxied to the Nest API in dev (proxy.conf) and served behind the same host in prod. */
export const API_BASE = '/api/v1';

/** Builds HttpParams from a query object, skipping null/undefined values. */
export function toParams(query?: Record<string, unknown>): HttpParams {
  let params = new HttpParams();
  if (!query) return params;
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') {
      params = params.set(key, String(value));
    }
  }
  return params;
}
