import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, throwError } from 'rxjs';
import { APP_CONFIG } from '../config/app-config';
import { ApiError } from './api-error';

/** Path of the refresh-token lifetimes (ADR-012); the Bearer is added by the interceptor. */
export const TOKEN_LIFETIMES_PATH = '/api/v1/auth/admin/token-lifetimes';

/** The client a user signed in from; a lifetime is set per role × client. */
export type ClientType = 'web' | 'mobile' | 'admin';

export const CLIENT_TYPES: readonly ClientType[] = ['web', 'mobile', 'admin'];

export interface TokenLifetime {
  readonly role: string;
  readonly clientType: ClientType;
  readonly refreshLifetimeHours: number;
  readonly updatedAt: string;
  /** Administrator who changed it last; null for a seeded row. */
  readonly updatedBy: string | null;
}

export interface TokenLifetimes {
  readonly policies: readonly TokenLifetime[];
  /** The lifetime of a user none of whose roles has a row. */
  readonly fallbackHours: number;
  /** Bounds the server enforces (1 h … 90 days today). */
  readonly minHours: number;
  readonly maxHours: number;
}

export interface TokenLifetimeChange {
  readonly role: string;
  readonly clientType: ClientType;
  readonly refreshLifetimeHours: number;
}

/**
 * `auth/admin/token-lifetimes`, written by hand: the panel generates no client for the C# auth
 * service. Any admin level reads; `super` changes, with a reason (≤ 500) — each changed pair goes
 * to the admin trail, a pair sent with its current value is left alone. A change applies to
 * tokens issued or rotated after it. Errors come out as `ApiError` (400 / 422 — validation,
 * 403 — level too low).
 */
@Injectable({ providedIn: 'root' })
export class TokenLifetimesApi {
  private readonly http = inject(HttpClient);
  private readonly url = `${inject(APP_CONFIG).apiBaseUrl}${TOKEN_LIFETIMES_PATH}`;

  /** Every lifetime, the fallback and the bounds. */
  list(): Observable<TokenLifetimes> {
    return this.http.get<TokenLifetimes>(this.url).pipe(catchError(toApiError));
  }

  /** Changes some lifetimes; answers with every lifetime as it now stands. */
  update(policies: readonly TokenLifetimeChange[], reason: string): Observable<TokenLifetimes> {
    return this.http
      .put<TokenLifetimes>(this.url, { policies, reason })
      .pipe(catchError(toApiError));
  }
}

function toApiError(error: unknown): Observable<never> {
  return throwError(() => ApiError.from(error));
}
