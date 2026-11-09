import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { SessionStore } from '../../core/auth/session.store';
import { adminToken, fakeJwt, sessionBody, settle } from '../../core/auth/testing';
import { APP_CONFIG } from '../../core/config/app-config';
import { LoginFlow, normaliseBackupCode } from './login-flow';

const BASE = 'http://gw/api/v1/auth/admin/session';
const LATER = '2999-01-01T00:00:00Z';
const SECRET = {
  secretKey: 'JBSWY3DPEHPK3PXP',
  qrCodeUri: 'otpauth://totp/x',
  qrCodeImageBase64: 'iVBO',
};

describe('LoginFlow', () => {
  let flow: LoginFlow;
  let http: HttpTestingController;
  let store: SessionStore;
  let navigate: ReturnType<typeof vi.spyOn>;

  function setUp(returnUrl: string | null = null) {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: APP_CONFIG, useValue: { apiBaseUrl: 'http://gw' } },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { queryParamMap: convertToParamMap(returnUrl ? { returnUrl } : {}) },
          },
        },
        LoginFlow,
      ],
    });
    flow = TestBed.inject(LoginFlow);
    http = TestBed.inject(HttpTestingController);
    store = TestBed.inject(SessionStore);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  }

  afterEach(() => http.verify());

  async function toMfa(): Promise<void> {
    const done = flow.submitPassword('admin@example.no', 'pw');
    http
      .expectOne(`${BASE}/login`)
      .flush({ mfaRequired: true, challenge: { mfaChallengeToken: 'chal', expiresAt: LATER } });
    await done;
  }

  async function toSetup(): Promise<void> {
    const done = flow.submitPassword('admin@example.no', 'pw');
    http
      .expectOne(`${BASE}/login`)
      .flush({ mfaSetupRequired: true, setup: { mfaSetupToken: 'setup', expiresAt: LATER } });
    await settle();
    const secret = http.expectOne(`${BASE}/mfa-setup`);
    expect(secret.request.body).toEqual({ mfaSetupToken: 'setup' });
    secret.flush(SECRET);
    await done;
  }

  it('password → MFA step; the email is kept', async () => {
    setUp();
    await toMfa();
    expect(flow.state()).toMatchObject({ step: 'mfa', useBackupCode: false });
    expect(flow.email()).toBe('admin@example.no');
    expect(flow.busy()).toBe(false);
  });

  it('a code opens the session and goes to the safe return URL', async () => {
    setUp('/schools?page=2');
    await toMfa();

    const done = flow.submitCode(' 123456 ');
    const req = http.expectOne(`${BASE}/mfa`);
    expect(req.request.body).toEqual({ mfaChallengeToken: 'chal', code: '123456' });
    req.flush(sessionBody(adminToken()));
    await done;

    expect(store.isAuthenticated()).toBe(true);
    expect(navigate).toHaveBeenCalledWith('/schools?page=2', { replaceUrl: true });
  });

  it('a foreign return URL becomes /', async () => {
    setUp('//evil.example');
    await toMfa();
    const done = flow.submitCode('123456');
    http.expectOne(`${BASE}/mfa`).flush(sessionBody(adminToken()));
    await done;
    expect(navigate).toHaveBeenCalledWith('/', { replaceUrl: true });
  });

  it('a backup code goes to its own route, normalised', async () => {
    setUp();
    await toMfa();
    flow.useBackupCode(true);

    const done = flow.submitCode('abcd1234-ef56 ');
    const req = http.expectOne(`${BASE}/mfa/backup`);
    expect(req.request.body).toEqual({ mfaChallengeToken: 'chal', backupCode: 'ABCD1234-EF56' });
    req.flush(sessionBody(adminToken()));
    await done;
    expect(store.isAuthenticated()).toBe(true);
  });

  it('a wrong code stays on the step with a message', async () => {
    setUp();
    await toMfa();
    const done = flow.submitCode('000000');
    http
      .expectOne(`${BASE}/mfa`)
      .flush({ code: 'INVALID_TOTP_CODE' }, { status: 401, statusText: 'Unauthorized' });
    await done;

    expect(flow.state().step).toBe('mfa');
    expect(flow.message()).toEqual({ key: 'invalidCode' });
    expect(store.isAuthenticated()).toBe(false);
  });

  it('a challenge the server no longer takes → back to the password step', async () => {
    setUp();
    await toMfa();
    const done = flow.submitCode('123456');
    http
      .expectOne(`${BASE}/mfa`)
      .flush({ code: 'INVALID_TOKEN' }, { status: 401, statusText: 'Unauthorized' });
    await done;

    expect(flow.state()).toEqual({ step: 'password' });
    expect(flow.message()).toEqual({ key: 'expired' });
    expect(flow.email()).toBe('admin@example.no');
  });

  it('an expired challenge starts over without a request', async () => {
    setUp();
    const done = flow.submitPassword('admin@example.no', 'pw');
    http.expectOne(`${BASE}/login`).flush({
      mfaRequired: true,
      challenge: { mfaChallengeToken: 'chal', expiresAt: '2000-01-01T00:00:00Z' },
    });
    await done;

    await flow.submitCode('123456');
    http.expectNone(`${BASE}/mfa`);
    expect(flow.state()).toEqual({ step: 'password' });
    expect(flow.message()).toEqual({ key: 'expired' });
  });

  it('a password lock shows its unlock time', async () => {
    setUp();
    const done = flow.submitPassword('admin@example.no', 'bad');
    http
      .expectOne(`${BASE}/login`)
      .flush(
        { code: 'ACCOUNT_LOCKED', lockedUntil: '2030-01-01T10:15:00Z' },
        { status: 423, statusText: 'Locked' },
      );
    await done;

    expect(flow.message()).toEqual({
      key: 'lockedUntil',
      until: new Date('2030-01-01T10:15:00Z'),
    });
  });

  it('setup: secret → first code → backup codes; the session waits for "saved"', async () => {
    setUp();
    await toSetup();
    expect(flow.state()).toMatchObject({ step: 'setup', secret: SECRET });

    const confirm = flow.confirmSetup('654321');
    const req = http.expectOne(`${BASE}/mfa-setup/confirm`);
    expect(req.request.body).toEqual({ mfaSetupToken: 'setup', code: '654321' });
    req.flush({ ...sessionBody(adminToken()), backupCodes: ['AAAAAAAA-0001', 'AAAAAAAA-0002'] });
    await confirm;

    expect(flow.state()).toMatchObject({
      step: 'backup-codes',
      codes: ['AAAAAAAA-0001', 'AAAAAAAA-0002'],
    });
    expect(store.isAuthenticated()).toBe(false);
    expect(navigate).not.toHaveBeenCalled();

    await flow.finishBackupCodes();
    expect(store.isAuthenticated()).toBe(true);
    expect(navigate).toHaveBeenCalledWith('/', { replaceUrl: true });
  });

  it('setup: a failed secret load can be retried', async () => {
    setUp();
    const done = flow.submitPassword('admin@example.no', 'pw');
    http
      .expectOne(`${BASE}/login`)
      .flush({ mfaSetupRequired: true, setup: { mfaSetupToken: 'setup', expiresAt: LATER } });
    await settle();
    http.expectOne(`${BASE}/mfa-setup`).flush(null, { status: 502, statusText: 'Bad Gateway' });
    await done;

    expect(flow.state()).toMatchObject({ step: 'setup', secret: null });
    expect(flow.message()).toEqual({ key: 'unavailable' });

    const retry = flow.loadSetupSecret();
    http.expectOne(`${BASE}/mfa-setup`).flush(SECRET);
    await retry;
    expect(flow.state()).toMatchObject({ step: 'setup', secret: SECRET });
    expect(flow.message()).toBeNull();
  });

  it('a session token without admin_level is refused and ended on the server', async () => {
    setUp();
    await toMfa();
    const done = flow.submitCode('123456');
    http
      .expectOne(`${BASE}/mfa`)
      .flush(sessionBody(fakeJwt({ sub: 'u', email: 'e@x.no', exp: 9999999999 })));
    await done;

    http.expectOne(`${BASE}/logout`).flush(null, { status: 204, statusText: 'No Content' });
    expect(flow.state()).toEqual({ step: 'password' });
    expect(flow.message()).toEqual({ key: 'accessDenied' });
    expect(store.isAuthenticated()).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe('normaliseBackupCode', () => {
  it('drops spaces and upper-cases', () => {
    expect(normaliseBackupCode(' abcd 1234-ef56\n')).toBe('ABCD1234-EF56');
  });
});
