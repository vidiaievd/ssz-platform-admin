import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { APP_CONFIG } from '../config/app-config';
import { ADMIN_SESSION_PATH } from './admin-session.api';
import { SessionStore } from './session.store';

/** Where the panel sends an administrator whose session is over (screen comes in step 3). */
export const LOGIN_PATH = '/login';

/**
 * Bearer on calls to the gateway — and only there (translations and `config.json` come from
 * the panel's own origin). A 401 means the access token expired: one shared refresh, then the
 * request is repeated once. When the session is over, the administrator goes to the login
 * screen; when the gateway could not refresh (network, 5xx), the original 401 is passed on.
 * The session routes themselves are left alone — they answer with their own errors.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const apiBase = `${inject(APP_CONFIG).apiBaseUrl}/`;
  if (!req.url.startsWith(apiBase) || isSessionRoute(req.url, apiBase)) {
    return next(req);
  }

  const session = inject(SessionStore);
  const router = inject(Router);
  const sentWith = session.accessToken();

  return next(withBearer(req, sentWith)).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse) || error.status !== 401) {
        return throwError(() => error);
      }

      // Another request may have refreshed while this one was in flight.
      const current = session.accessToken();
      const fresh = current && current !== sentWith ? Promise.resolve(current) : session.refresh();

      return from(fresh.catch(() => undefined)).pipe(
        switchMap((token) => {
          if (token === undefined) return throwError(() => error);
          if (token === null) {
            redirectToLogin(router);
            return throwError(() => error);
          }
          return next(withBearer(req, token));
        }),
      );
    }),
  );
};

function isSessionRoute(url: string, apiBase: string): boolean {
  return url.startsWith(`${apiBase}${ADMIN_SESSION_PATH.slice(1)}/`);
}

function withBearer(req: HttpRequest<unknown>, token: string | null): HttpRequest<unknown> {
  return token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;
}

function redirectToLogin(router: Router): void {
  const current = router.url;
  if (current.startsWith(LOGIN_PATH)) return;
  void router.navigate([LOGIN_PATH], {
    queryParams: current && current !== '/' ? { returnUrl: current } : {},
  });
}
