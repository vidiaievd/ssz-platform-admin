import { ApiError } from '../../core/auth/api-error';
import { LoginAttempt, describeLoginFailure } from './login-message';

const err = (status: number, code: string | null, lockedUntil: Date | null = null) =>
  new ApiError(status, code, 'x', lockedUntil);

describe('describeLoginFailure', () => {
  it.each<[ApiError, LoginAttempt, string, boolean]>([
    [err(401, 'INVALID_CREDENTIALS'), 'password', 'invalidCredentials', false],
    [err(401, 'INVALID_TOTP_CODE'), 'code', 'invalidCode', false],
    [err(401, 'INVALID_TOTP_CODE'), 'setup', 'invalidCode', false],
    [err(401, 'INVALID_TOTP_CODE'), 'backup-code', 'invalidBackupCode', false],
    [err(401, 'INVALID_TOKEN'), 'code', 'expired', true],
    [err(401, 'INVALID_TOKEN'), 'setup', 'expired', true],
    [err(403, 'ADMIN_ACCESS_DENIED'), 'password', 'accessDenied', true],
    [err(200, 'MALFORMED_ACCESS_TOKEN'), 'code', 'accessDenied', true],
    [err(403, 'MFA_SETUP_REQUIRED'), 'code', 'setupRequired', true],
    [err(400, 'MFA_ALREADY_ENABLED'), 'setup', 'mfaAlreadyEnabled', true],
    [err(403, 'EMAIL_NOT_VERIFIED'), 'password', 'emailNotVerified', false],
    [err(423, 'ACCOUNT_LOCKED'), 'code', 'tooManyAttempts', false],
    [err(422, 'VALIDATION_ERROR'), 'password', 'invalidInput', false],
    [err(0, null), 'password', 'network', false],
    [err(503, null), 'password', 'unavailable', false],
    [err(429, null), 'code', 'unavailable', false],
    [err(418, null), 'password', 'unexpected', false],
  ])('%o on %s → %s (restart %s)', (error, attempt, key, restart) => {
    const failure = describeLoginFailure(error, attempt);
    expect(failure.message.key).toBe(key);
    expect(failure.restart).toBe(restart);
  });

  it('carries the unlock time of a password lock', () => {
    const until = new Date('2030-01-01T10:15:00Z');
    expect(describeLoginFailure(err(423, 'ACCOUNT_LOCKED', until), 'password')).toEqual({
      message: { key: 'lockedUntil', until },
      restart: false,
    });
  });
});
