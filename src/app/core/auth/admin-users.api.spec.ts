import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { APP_CONFIG } from '../config/app-config';
import { AdminUserDetail, AdminUserPage, AdminUsersApi } from './admin-users.api';
import { ApiError } from './api-error';

const URL = 'http://gw/api/v1/auth/admin/users';
const ID = '0b8f4c1e-2d3a-4f5b-8c6d-7e8f9a0b1c2d';

const ROW = {
  id: ID,
  email: 'ola@example.no',
  roles: ['student'],
  adminLevel: null,
  emailVerified: true,
  twoFactorEnabled: false,
  blockedAt: null,
  lockedUntil: null,
  deletionRequestedAt: null,
  purgeAt: null,
  createdAt: '2026-11-01T10:00:00Z',
  lastLoginAt: null,
};

const PAGE: AdminUserPage = { items: [ROW], total: 1, page: 1, limit: 25 };

const CARD: AdminUserDetail = {
  ...ROW,
  block: null,
  failedLogins: { count: 0, lastAt: null, lockedUntil: null },
  mfaCodes: { available: true, failures: 0, lockedUntil: null },
  backupCodesLeft: 0,
  sessions: [
    { clientType: 'web', active: 0, lastIssuedAt: null, recent: [] },
    { clientType: 'mobile', active: 0, lastIssuedAt: null, recent: [] },
    { clientType: 'admin', active: 0, lastIssuedAt: null, recent: [] },
  ],
};

describe('AdminUsersApi', () => {
  let api: AdminUsersApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: APP_CONFIG, useValue: { apiBaseUrl: 'http://gw' } },
      ],
    });
    api = TestBed.inject(AdminUsersApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists without parameters when none are given', async () => {
    const result = firstValueFrom(api.list());
    const req = http.expectOne(URL);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.keys()).toEqual([]);
    req.flush(PAGE);

    expect(await result).toEqual(PAGE);
  });

  it('sends the filters, a trimmed search and the ids joined by commas', async () => {
    const result = firstValueFrom(
      api.list({
        search: '  ola ',
        role: 'student',
        status: 'deletion_pending',
        sort: '-lastLoginAt',
        page: 2,
        limit: 50,
        ids: [ID, 'b'],
      }),
    );
    const req = http.expectOne((r) => r.url === URL);
    const params = req.request.params;
    expect(params.get('search')).toBe('ola');
    expect(params.get('role')).toBe('student');
    expect(params.get('status')).toBe('deletion_pending');
    expect(params.get('sort')).toBe('-lastLoginAt');
    expect(params.get('page')).toBe('2');
    expect(params.get('limit')).toBe('50');
    expect(params.get('ids')).toBe(`${ID},b`);
    req.flush(PAGE);
    await result;
  });

  it('leaves out a blank search and an empty id list', async () => {
    const result = firstValueFrom(api.list({ search: '   ', ids: [] }));
    const req = http.expectOne((r) => r.url === URL);
    expect(req.request.params.keys()).toEqual([]);
    req.flush(PAGE);
    await result;
  });

  it('reads one card', async () => {
    const result = firstValueFrom(api.get(ID));
    const req = http.expectOne(`${URL}/${ID}`);
    expect(req.request.method).toBe('GET');
    req.flush(CARD);

    expect(await result).toEqual(CARD);
  });

  it.each([
    ['block', (a: AdminUsersApi) => a.block(ID, 'spam'), 'block'],
    ['unblock', (a: AdminUsersApi) => a.unblock(ID, 'spam'), 'unblock'],
    ['unlock', (a: AdminUsersApi) => a.unlock(ID, 'spam'), 'unlock'],
    ['resetMfa', (a: AdminUsersApi) => a.resetMfa(ID, 'spam'), 'mfa/reset'],
    ['cancelDeletion', (a: AdminUsersApi) => a.cancelDeletion(ID, 'spam'), 'deletion/cancel'],
  ])('%s posts the reason and answers the card', async (_name, call, path) => {
    const result = firstValueFrom(call(api));
    const req = http.expectOne(`${URL}/${ID}/${path}`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ reason: 'spam' });
    req.flush(CARD);

    expect(await result).toEqual(CARD);
  });

  it('revokes the sessions of one client, or of every client without one', async () => {
    const one = firstValueFrom(api.revokeSessions(ID, 'lost phone', 'mobile'));
    const first = http.expectOne(`${URL}/${ID}/sessions/revoke`);
    expect(first.request.body).toEqual({ reason: 'lost phone', clientType: 'mobile' });
    first.flush(CARD);
    await one;

    const all = firstValueFrom(api.revokeSessions(ID, 'lost phone'));
    const second = http.expectOne(`${URL}/${ID}/sessions/revoke`);
    expect(second.request.body).toEqual({ reason: 'lost phone' });
    second.flush(CARD);
    await all;
  });

  it('turns a refusal into ApiError', async () => {
    const result = firstValueFrom(api.block(ID, 'x')).catch((error: unknown) => error);
    http
      .expectOne(`${URL}/${ID}/block`)
      .flush(
        { title: 'Conflict', status: 409, code: 'NOTHING_TO_CHANGE' },
        { status: 409, statusText: 'Conflict' },
      );

    const error = await result;
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(409);
    expect((error as ApiError).code).toBe('NOTHING_TO_CHANGE');
  });
});
