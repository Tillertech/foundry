import { HttpErrorResponse } from '@angular/common/http';

/** Human-readable message from a Nest error payload (message: string | string[]). */
export function apiErrorMessage(err: unknown, fallback = 'Something went wrong'): string {
  if (err instanceof HttpErrorResponse) {
    const message = (err.error as { message?: string | string[] } | null)?.message;
    if (Array.isArray(message)) return message.join('. ');
    if (typeof message === 'string') return message;
    if (err.status === 0) return 'Cannot reach the server.';
  }
  return fallback;
}
