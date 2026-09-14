import { HttpErrorResponse, HttpParams } from '@angular/common/http';

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

// Transport-level shapes shared by every resource API.

export interface PaginatedResponse<T> {
  count?: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface PaginationQuery {
  cursor?: string;
  take?: number;
}

export interface MessageResponse {
  message: string;
}

/** Human-readable message from a Nest error payload (message: string | string[]). */
export function apiErrorMessage(
  err: unknown,
  fallback = 'Something went wrong',
): string {
  if (err instanceof HttpErrorResponse) {
    const message = (err.error as { message?: string | string[] } | null)
      ?.message;
    if (Array.isArray(message)) return message.join('. ');
    if (typeof message === 'string') return message;
    if (err.status === 0) return 'Cannot reach the server.';
  }
  return fallback;
}
