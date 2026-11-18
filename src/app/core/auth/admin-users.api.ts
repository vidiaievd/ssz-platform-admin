import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, throwError } from 'rxjs';
import { APP_CONFIG } from '../config/app-config';
import { AdminLevel } from './admin-level';
import { ApiError } from './api-error';
import { ClientType } from './token-lifetimes.api';

/** Accounts in the panel (plan 90, phase 6); the Bearer is added by the interceptor. */
export const ADMIN_USERS_PATH = '/api/v1/auth/admin/users';

/** Every role auth knows (`RoleNames`); `role=` filters by any of them. */
export const USER_ROLES = [
  'student',
  'tutor',
  'teacher',
  'school_admin',
  'platform_admin',
  'manager_platform',
  'premium',
] as const;
export type UserRole = (typeof USER_ROLES)[number];

/**
 * `active` = not blocked, no running lockout, no deletion request, e-mail confirmed; `locked` =
 * a lockout after failed sign-ins still running (the two-factor code lockout lives in Redis and
 * is only on the card).
 */
export const USER_STATUSES = [
  'active',
  'blocked',
  'locked',
  'deletion_pending',
  'unverified',
] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

/** `-lastLoginAt` puts accounts that never signed in last; ties go by id. */
export const USER_SORTS = ['-createdAt', 'createdAt', 'email', '-email', '-lastLoginAt'] as const;
export type UserSort = (typeof USER_SORTS)[number];

export interface AdminUserListParams {
  /** Part of the e-mail, at least 2 characters; shorter or empty — no search. */
  readonly search?: string;
  readonly role?: UserRole;
  readonly status?: UserStatus;
  readonly sort?: UserSort;
  /** From 1. */
  readonly page?: number;
  /** 1–100, the server's default is 25. */
  readonly limit?: number;
  /** Up to 100 account ids; unknown ones are simply absent from the answer. */
  readonly ids?: readonly string[];
}

/** One account of the list. Dates are ISO strings. */
export interface AdminUserListItem {
  readonly id: string;
  readonly email: string;
  readonly roles: readonly string[];
  /** Only a platform administrator with a level has one. */
  readonly adminLevel: AdminLevel | null;
  readonly emailVerified: boolean;
  readonly twoFactorEnabled: boolean;
  readonly blockedAt: string | null;
  /** End of a lockout after failed sign-ins still running; an expired one is null. */
  readonly lockedUntil: string | null;
  readonly deletionRequestedAt: string | null;
  /** When a pending deletion erases the account. */
  readonly purgeAt: string | null;
  readonly createdAt: string;
  readonly lastLoginAt: string | null;
}

export interface AdminUserPage {
  readonly items: readonly AdminUserListItem[];
  readonly total: number;
  readonly page: number;
  readonly limit: number;
}

export interface AdminUserBlock {
  readonly at: string;
  /** The administrator who blocked; null when not recorded. */
  readonly by: string | null;
  /** Never shown to the account's holder. */
  readonly reason: string | null;
}

export interface AdminUserFailedLogins {
  /** Wrong passwords since the last successful sign-in. */
  readonly count: number;
  readonly lastAt: string | null;
  readonly lockedUntil: string | null;
}

/** Wrong two-factor codes on every client; `available: false` — Redis was not read, the rest says nothing. */
export interface AdminUserMfaCodes {
  readonly available: boolean;
  readonly failures: number;
  readonly lockedUntil: string | null;
}

export interface AdminUserSession {
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly deviceInfo: string | null;
}

/** Always three of them: web, mobile, admin. */
export interface AdminUserClientSessions {
  readonly clientType: ClientType;
  /** Sessions open now. */
  readonly active: number;
  /** When this client last got a token (sign-in or refresh), revoked or not. */
  readonly lastIssuedAt: string | null;
  /** The three newest open sessions. */
  readonly recent: readonly AdminUserSession[];
}

export interface AdminUserDetail extends AdminUserListItem {
  readonly block: AdminUserBlock | null;
  readonly failedLogins: AdminUserFailedLogins;
  readonly mfaCodes: AdminUserMfaCodes;
  readonly backupCodesLeft: number;
  readonly sessions: readonly AdminUserClientSessions[];
}

/**
 * `auth/admin/users`, written by hand: the panel generates no client for the C# auth service.
 * Any admin level reads. Every action takes a reason (required, ≤ 500), lands in the admin trail
 * and answers the card as it is afterwards. Who may press what (the server checks it again,
 * knowing the target): `block` / `unblock` / `cancelDeletion` — `admin`; `unlock` /
 * `revokeSessions` / `resetMfa` — any level; blocking, unblocking or resetting MFA of a
 * platform_admin account — `super`.
 *
 * Refusals come out as `ApiError`: 400 `INVALID_FILTER` (list), 400 `ADMIN_SELF_CHANGE`,
 * 400 `ADMIN_LAST_SUPER`, 403 `ADMIN_LEVEL_REQUIRED`, 404, 409 `NOTHING_TO_CHANGE` (nothing
 * changed, no trail row — re-read the card), 422 `VALIDATION_ERROR` (reason, client), 503
 * `LOCKOUT_STORE_UNAVAILABLE` (unlock with Redis down).
 */
@Injectable({ providedIn: 'root' })
export class AdminUsersApi {
  private readonly http = inject(HttpClient);
  private readonly url = `${inject(APP_CONFIG).apiBaseUrl}${ADMIN_USERS_PATH}`;

  list(params: AdminUserListParams = {}): Observable<AdminUserPage> {
    return this.http
      .get<AdminUserPage>(this.url, { params: listParams(params) })
      .pipe(catchError(toApiError));
  }

  get(userId: string): Observable<AdminUserDetail> {
    return this.http.get<AdminUserDetail>(this.userUrl(userId)).pipe(catchError(toApiError));
  }

  /** Ends every session; none opens until unblocked. A handed-out access token lives ≤ 15 min. */
  block(userId: string, reason: string): Observable<AdminUserDetail> {
    return this.act(userId, 'block', { reason });
  }

  unblock(userId: string, reason: string): Observable<AdminUserDetail> {
    return this.act(userId, 'unblock', { reason });
  }

  /** Lifts the lockout after failed sign-ins and the two-factor code lockout. */
  unlock(userId: string, reason: string): Observable<AdminUserDetail> {
    return this.act(userId, 'unlock', { reason });
  }

  /** The sessions of one client, or of every client without one. */
  revokeSessions(
    userId: string,
    reason: string,
    clientType?: ClientType,
  ): Observable<AdminUserDetail> {
    return this.act(userId, 'sessions/revoke', clientType ? { reason, clientType } : { reason });
  }

  /** Turns two-factor sign-in off, ends the admin-panel sessions, clears the code count. */
  resetMfa(userId: string, reason: string): Observable<AdminUserDetail> {
    return this.act(userId, 'mfa/reset', { reason });
  }

  cancelDeletion(userId: string, reason: string): Observable<AdminUserDetail> {
    return this.act(userId, 'deletion/cancel', { reason });
  }

  private act(userId: string, action: string, body: object): Observable<AdminUserDetail> {
    return this.http
      .post<AdminUserDetail>(`${this.userUrl(userId)}/${action}`, body)
      .pipe(catchError(toApiError));
  }

  private userUrl(userId: string): string {
    return `${this.url}/${encodeURIComponent(userId)}`;
  }
}

function listParams(p: AdminUserListParams): HttpParams {
  let params = new HttpParams();
  const search = p.search?.trim();
  if (search) params = params.set('search', search);
  if (p.role) params = params.set('role', p.role);
  if (p.status) params = params.set('status', p.status);
  if (p.sort) params = params.set('sort', p.sort);
  if (p.page !== undefined) params = params.set('page', p.page);
  if (p.limit !== undefined) params = params.set('limit', p.limit);
  if (p.ids && p.ids.length > 0) params = params.set('ids', p.ids.join(','));
  return params;
}

function toApiError(error: unknown): Observable<never> {
  return throwError(() => ApiError.from(error));
}
