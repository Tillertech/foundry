import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { ApiTokenStore } from './api-token.store';

/** Attaches the JWT to API requests. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const token = inject(ApiTokenStore).token();
  if (token && req.url.startsWith('/api/')) {
    return next(
      req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }),
    );
  }
  return next(req);
};
