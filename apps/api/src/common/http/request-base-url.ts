import type { Request } from 'express';

/** Absolute URL of the current route without query params, for pagination links. */
export function requestBaseUrl(req: Request): string {
  return `${req.protocol}://${req.get('host')}${req.originalUrl.split('?')[0]}`;
}
