import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, throwError } from 'rxjs';
import { APP_CONFIG } from '../config/app-config';
import { AdminLevel } from './admin-level';
import { ApiError } from './api-error';

/** Who may use the panel and at which level (plan 90); the Bearer is added by the interceptor. */
export const ADMINS_PATH = '/api/v1/auth/admin/admins';

export interface AdminEntry {
  readonly userId: string;
  readonly email: string;
  readonly level: AdminLevel;
  readonly grantedAt: string;
  /** The super who granted or last changed the level; null for the bootstrapped one. */
  readonly grantedBy: string | null;
  readonly twoFactorEnabled: boolean;
}

/**
 * `auth/admin/admins`, written by hand (no generated client for auth). `super` only — a lower
 * level gets 403. Every change takes a reason (required, ≤ 500) and lands in the admin trail.
 * `set` makes an existing account an administrator or changes its level (the same level again
 * changes nothing); `revoke` takes the role and level away and ends its panel sessions, web
 * sessions stay.
 *
 * Refusals come out as `ApiError`: 400 `ADMIN_SELF_CHANGE` (your own level), 400
 * `ADMIN_LAST_SUPER` (lowering or removing the last super who can sign in), 400
 * `ADMIN_NOT_FOUND` (revoking someone who is not an administrator), 404 (no such account),
 * 422 (reason, unknown level).
 */
@Injectable({ providedIn: 'root' })
export class AdminsApi {
  private readonly http = inject(HttpClient);
  private readonly url = `${inject(APP_CONFIG).apiBaseUrl}${ADMINS_PATH}`;

  /** Every administrator, highest level first. */
  list(): Observable<readonly AdminEntry[]> {
    return this.http.get<{ items: readonly AdminEntry[] }>(this.url).pipe(
      map((answer) => answer.items),
      catchError(toApiError),
    );
  }

  set(userId: string, level: AdminLevel, reason: string): Observable<AdminEntry> {
    return this.http
      .put<AdminEntry>(this.userUrl(userId), { level, reason })
      .pipe(catchError(toApiError));
  }

  /** The reason goes in the query string (DELETE has no body here). */
  revoke(userId: string, reason: string): Observable<void> {
    return this.http
      .delete<void>(this.userUrl(userId), { params: new HttpParams().set('reason', reason) })
      .pipe(catchError(toApiError));
  }

  private userUrl(userId: string): string {
    return `${this.url}/${encodeURIComponent(userId)}`;
  }
}

function toApiError(error: unknown): Observable<never> {
  return throwError(() => ApiError.from(error));
}
