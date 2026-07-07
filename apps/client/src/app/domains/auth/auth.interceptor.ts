import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { ApiTokenStore } from './api-token.store';

/** Attaches the JWT to API requests and drops the session on 401. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const tokenStore = inject(ApiTokenStore);
  const router = inject(Router);
  const token = tokenStore.token();

  const isApi = req.url.startsWith('/api/');
  const request =
    token && isApi
      ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
      : req;

  return next(request).pipe(
    catchError((err) => {
      if (
        isApi &&
        err instanceof HttpErrorResponse &&
        err.status === 401 &&
        !req.url.includes('/auth/')
      ) {
        tokenStore.clear();
        void router.navigateByUrl('/auth/login');
      }
      return throwError(() => err);
    }),
  );
};
