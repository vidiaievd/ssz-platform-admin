import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, throwError } from 'rxjs';
import { APP_CONFIG } from '../config/app-config';
import { ApiError } from './api-error';

/** Path of the admin-session routes; the refresh cookie `ssz_admin_rt` is scoped to it. */
export const ADMIN_SESSION_PATH = '/api/v1/auth/admin/session';

/** The administrator has MFA: the code (or a backup code) goes with this token. */
export interface MfaChallenge {
  readonly kind: 'mfa';
  readonly mfaChallengeToken: string;
  readonly expiresAt: string;
}

/** The administrator has no MFA yet: this token can only set it up (10 minutes). */
export interface MfaSetupChallenge {
  readonly kind: 'mfa-setup';
  readonly mfaSetupToken: string;
  readonly expiresAt: string;
}

export type LoginStep = MfaChallenge | MfaSetupChallenge;

/** An open admin session. The refresh token is never here — only in the httpOnly cookie. */
export interface AdminSession {
  readonly accessToken: string;
  readonly accessTokenExpiresAt: string;
  readonly sessionExpiresAt: string;
}

export interface MfaSetupSecret {
  readonly secretKey: string;
  /** `otpauth://…` for authenticators that take a link. */
  readonly qrCodeUri: string;
  /** PNG, base64 without the `data:` prefix. */
  readonly qrCodeImageBase64: string;
}

/** The session MFA setup opens, plus the backup codes — shown to the administrator once. */
export interface MfaSetupConfirmed extends AdminSession {
  readonly backupCodes: readonly string[];
}

interface RawLoginResponse {
  mfaRequired?: boolean;
  challenge?: { mfaChallengeToken: string; expiresAt: string };
  mfaSetupRequired?: boolean;
  setup?: { mfaSetupToken: string; expiresAt: string };
}

/**
 * The seven `auth/admin/session/*` routes, written by hand: `login` answers anonymous objects
 * that Swagger does not describe. Every call goes `withCredentials`, so the browser stores and
 * sends the refresh cookie across the panel → gateway origins. Errors come out as `ApiError`.
 */
@Injectable({ providedIn: 'root' })
export class AdminSessionApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${inject(APP_CONFIG).apiBaseUrl}${ADMIN_SESSION_PATH}`;

  /** Password step; never a session — always the next step. */
  login(email: string, password: string): Observable<LoginStep> {
    return this.post<RawLoginResponse>('login', { email, password }).pipe(map(toLoginStep));
  }

  /** Authenticator code → session. */
  verifyMfa(mfaChallengeToken: string, code: string): Observable<AdminSession> {
    return this.post<AdminSession>('mfa', { mfaChallengeToken, code });
  }

  /** One-time backup code → session. */
  verifyBackupCode(mfaChallengeToken: string, backupCode: string): Observable<AdminSession> {
    return this.post<AdminSession>('mfa/backup', { mfaChallengeToken, backupCode });
  }

  /** MFA setup, step 1: the secret and QR code. */
  startMfaSetup(mfaSetupToken: string): Observable<MfaSetupSecret> {
    return this.post<MfaSetupSecret>('mfa-setup', { mfaSetupToken });
  }

  /** MFA setup, step 2: the first code turns MFA on and opens the session. */
  confirmMfaSetup(mfaSetupToken: string, code: string): Observable<MfaSetupConfirmed> {
    return this.post<MfaSetupConfirmed>('mfa-setup/confirm', { mfaSetupToken, code });
  }

  /** A new access token from the cookie (the cookie rotates). 401/403 → the session is over. */
  refresh(): Observable<AdminSession> {
    return this.post<AdminSession>('refresh', {});
  }

  /** Ends this session and clears the cookie; always 204. */
  logout(): Observable<void> {
    return this.post<unknown>('logout', {}).pipe(map(() => undefined));
  }

  private post<T>(route: string, body: object): Observable<T> {
    return this.http
      .post<T>(`${this.base}/${route}`, body, { withCredentials: true })
      .pipe(catchError((error: unknown) => throwError(() => ApiError.from(error))));
  }
}

function toLoginStep(raw: RawLoginResponse): LoginStep {
  if (raw.mfaRequired && raw.challenge) {
    return { kind: 'mfa', ...raw.challenge };
  }
  if (raw.mfaSetupRequired && raw.setup) {
    return { kind: 'mfa-setup', ...raw.setup };
  }
  // The server never opens an admin session on a password alone; anything else is a bug.
  throw new ApiError(200, 'UNEXPECTED_LOGIN_RESPONSE', 'Unexpected login response');
}
