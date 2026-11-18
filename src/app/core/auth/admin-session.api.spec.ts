import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { APP_CONFIG } from '../config/app-config';
import { AdminSessionApi } from './admin-session.api';
import { ApiError } from './api-error';

const BASE = 'http://gw/api/v1/auth/admin/session';

describe('AdminSessionApi', () => {
  let api: AdminSessionApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: APP_CONFIG, useValue: { apiBaseUrl: 'http://gw' } },
      ],
    });
    api = TestBed.inject(AdminSessionApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('login → MFA challenge, with credentials', async () => {
    const result = firstValueFrom(api.login('a@b.no', 'pw'));
    const req = http.expectOne(`${BASE}/login`);
    expect(req.request.method).toBe('POST');
    expect(req.request.withCredentials).toBe(true);
    expect(req.request.body).toEqual({ email: 'a@b.no', password: 'pw' });
    req.flush({ mfaRequired: true, challenge: { mfaChallengeToken: 'c', expiresAt: 'T' } });

    expect(await result).toEqual({ kind: 'mfa', mfaChallengeToken: 'c', expiresAt: 'T' });
  });

  it('login → MFA setup for an administrator without MFA', async () => {
    const result = firstValueFrom(api.login('a@b.no', 'pw'));
    http
      .expectOne(`${BASE}/login`)
      .flush({ mfaSetupRequired: true, setup: { mfaSetupToken: 's', expiresAt: 'T' } });

    expect(await result).toEqual({ kind: 'mfa-setup', mfaSetupToken: 's', expiresAt: 'T' });
  });

  it('turns a problem+json failure into ApiError', async () => {
    const result = firstValueFrom(api.login('a@b.no', 'bad'));
    http
      .expectOne(`${BASE}/login`)
      .flush(
        { code: 'ACCOUNT_LOCKED', lockedUntil: '2030-01-01T00:00:00Z' },
        { status: 423, statusText: 'Locked' },
      );

    const error = await result.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(423);
    expect((error as ApiError).lockedUntil?.toISOString()).toBe('2030-01-01T00:00:00.000Z');
  });

  it('sends each MFA step to its route', () => {
    api.verifyMfa('c', '123456').subscribe();
    api.verifyBackupCode('c', 'ABCD-1234').subscribe();
    api.startMfaSetup('s').subscribe();
    api.confirmMfaSetup('s', '654321').subscribe();

    expect(http.expectOne(`${BASE}/mfa`).request.body).toEqual({
      mfaChallengeToken: 'c',
      code: '123456',
    });
    expect(http.expectOne(`${BASE}/mfa/backup`).request.body).toEqual({
      mfaChallengeToken: 'c',
      backupCode: 'ABCD-1234',
    });
    expect(http.expectOne(`${BASE}/mfa-setup`).request.body).toEqual({ mfaSetupToken: 's' });
    expect(http.expectOne(`${BASE}/mfa-setup/confirm`).request.body).toEqual({
      mfaSetupToken: 's',
      code: '654321',
    });
  });

  it('refresh and logout carry the cookie, no body fields', async () => {
    api.refresh().subscribe();
    const refresh = http.expectOne(`${BASE}/refresh`);
    expect(refresh.request.withCredentials).toBe(true);
    expect(refresh.request.body).toEqual({});

    const done = firstValueFrom(api.logout());
    const logout = http.expectOne(`${BASE}/logout`);
    expect(logout.request.withCredentials).toBe(true);
    logout.flush(null, { status: 204, statusText: 'No Content' });
    await expect(done).resolves.toBeUndefined();
  });
});
