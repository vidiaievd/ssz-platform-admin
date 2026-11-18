import { ApiError } from '../../core/auth/api-error';

/** A line the sign-in screen shows: a key under `login.messages`, plus a time for locks. */
export interface LoginMessage {
  readonly key: LoginMessageKey;
  /** For `lockedUntil`: when the account opens again. */
  readonly until?: Date;
}

export type LoginMessageKey =
  | 'invalidCredentials'
  | 'invalidCode'
  | 'invalidBackupCode'
  | 'lockedUntil'
  | 'tooManyAttempts'
  | 'accessDenied'
  | 'emailNotVerified'
  | 'expired'
  | 'mfaAlreadyEnabled'
  | 'setupRequired'
  | 'invalidInput'
  | 'unavailable'
  | 'network'
  | 'unexpected';

/** What the step that failed was sending: the same 401 code reads differently per step. */
export type LoginAttempt = 'password' | 'code' | 'backup-code' | 'setup';

export interface LoginFailure {
  readonly message: LoginMessage;
  /** The challenge or setup token is no good any more: back to the password step. */
  readonly restart: boolean;
}

/** Codes auth-service and the panel itself use on the sign-in routes. */
const CODES = {
  invalidCredentials: 'INVALID_CREDENTIALS',
  invalidCode: 'INVALID_TOTP_CODE',
  invalidToken: 'INVALID_TOKEN',
  accessDenied: 'ADMIN_ACCESS_DENIED',
  setupRequired: 'MFA_SETUP_REQUIRED',
  emailNotVerified: 'EMAIL_NOT_VERIFIED',
  mfaAlreadyEnabled: 'MFA_ALREADY_ENABLED',
  // Raised by SessionStore for a token without `admin_level`.
  malformedToken: 'MALFORMED_ACCESS_TOKEN',
} as const;

/** Turns a failed sign-in call into the line to show and whether to start over. */
export function describeLoginFailure(error: unknown, attempt: LoginAttempt): LoginFailure {
  const e = ApiError.from(error);
  const stay = (key: LoginMessageKey): LoginFailure => ({ message: { key }, restart: false });
  const restart = (key: LoginMessageKey): LoginFailure => ({ message: { key }, restart: true });

  switch (e.code) {
    case CODES.invalidCredentials:
      return stay('invalidCredentials');
    case CODES.invalidCode:
      return stay(attempt === 'backup-code' ? 'invalidBackupCode' : 'invalidCode');
    case CODES.invalidToken:
      // On the password step there is no token to expire; anywhere else it is the challenge.
      return attempt === 'password' ? stay('unexpected') : restart('expired');
    case CODES.accessDenied:
    case CODES.malformedToken:
      return restart('accessDenied');
    case CODES.setupRequired:
      return restart('setupRequired');
    case CODES.mfaAlreadyEnabled:
      return restart('mfaAlreadyEnabled');
    case CODES.emailNotVerified:
      return stay('emailNotVerified');
  }

  if (e.status === 423) {
    // Password lock carries the time; the per-account MFA counter (5 per 15 min) does not.
    return e.lockedUntil
      ? { message: { key: 'lockedUntil', until: e.lockedUntil }, restart: false }
      : stay('tooManyAttempts');
  }
  if (e.status === 0) return stay('network');
  if (e.status === 400 || e.status === 422) return stay('invalidInput');
  // nginx answers its rate limit with 503; 429 if it is ever switched.
  if (e.status === 429 || e.status >= 500) return stay('unavailable');
  return stay('unexpected');
}
