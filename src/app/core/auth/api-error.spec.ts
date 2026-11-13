import { HttpErrorResponse } from '@angular/common/http';
import { ApiError } from './api-error';

const httpError = (status: number, error: unknown) =>
  new HttpErrorResponse({ status, error, url: 'http://localhost/api/v1/x' });

describe('ApiError.from', () => {
  it('reads code and detail of a problem+json body', () => {
    const err = ApiError.from(
      httpError(403, {
        title: 'Forbidden',
        status: 403,
        detail: 'Not an administrator.',
        code: 'ADMIN_ACCESS_DENIED',
      }),
    );
    expect(err.status).toBe(403);
    expect(err.code).toBe('ADMIN_ACCESS_DENIED');
    expect(err.message).toBe('Not an administrator.');
    expect(err.lockedUntil).toBeNull();
  });

  it('reads lockedUntil of a 423', () => {
    const err = ApiError.from(
      httpError(423, { code: 'ACCOUNT_LOCKED', lockedUntil: '2030-01-01T10:15:00+00:00' }),
    );
    expect(err.lockedUntil?.toISOString()).toBe('2030-01-01T10:15:00.000Z');
  });

  it('parses a body that arrived as text', () => {
    const err = ApiError.from(httpError(401, '{"code":"INVALID_TOTP_CODE"}'));
    expect(err.code).toBe('INVALID_TOTP_CODE');
  });

  it('takes a NestJS message as the code only when it looks like one', () => {
    expect(
      ApiError.from(httpError(400, { statusCode: 400, message: 'ADMIN_LEVEL_REQUIRED' })).code,
    ).toBe('ADMIN_LEVEL_REQUIRED');
    const prose = ApiError.from(httpError(404, { statusCode: 404, message: 'School not found' }));
    expect(prose.code).toBeNull();
    expect(prose.message).toBe('School not found');
  });

  it('keeps field errors of a validation failure', () => {
    const err = ApiError.from(
      httpError(422, { code: 'VALIDATION_ERROR', errors: { Email: ['Required'] } }),
    );
    expect(err.fieldErrors).toEqual({ Email: ['Required'] });
  });

  it('marks an unreachable gateway as a network error', () => {
    const err = ApiError.from(httpError(0, new ProgressEvent('error')));
    expect(err.isNetworkError).toBe(true);
    expect(err.code).toBeNull();
  });
});
