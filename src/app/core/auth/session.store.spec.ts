import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { APP_CONFIG } from '../config/app-config';
import { ApiError } from './api-error';
import { SessionStore } from './session.store';
import { adminToken, sessionBody, settle } from './testing';

const REFRESH = 'http://gw/api/v1/auth/admin/session/refresh';

describe('SessionStore', () => {
  let store: SessionStore;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: APP_CONFIG, useValue: { apiBaseUrl: 'http://gw' } },
      ],
    });
    store = TestBed.inject(SessionStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('starts signed out', () => {
    expect(store.isAuthenticated()).toBe(false);
    expect(store.accessToken()).toBeNull();
    expect(store.hasLevel('support')).toBe(false);
  });

  it('takes a session and exposes its claims', () => {
    const token = adminToken({ admin_level: 'admin', email: 'x@y.no' });
    store.start(sessionBody(token));

    expect(store.isAuthenticated()).toBe(true);
    expect(store.accessToken()).toBe(token);
    expect(store.claims()?.email).toBe('x@y.no');
    expect(store.adminLevel()).toBe('admin');
    expect(store.hasLevel('support')).toBe(true);
    expect(store.hasLevel('super')).toBe(false);
    expect(store.sessionExpiresAt()?.toISOString()).toBe('2030-01-01T12:00:00.000Z');
  });

  it('refuses a token without an admin level', () => {
    expect(() => store.start(sessionBody(adminToken({ admin_level: undefined })))).toThrow(
      ApiError,
    );
    expect(store.isAuthenticated()).toBe(false);
  });

  it('shares one refresh request between parallel callers', async () => {
    const a = store.refresh();
    const b = store.refresh();
    const token = adminToken();
    http.expectOne(REFRESH).flush(sessionBody(token));

    expect(await a).toBe(token);
    expect(await b).toBe(token);
    expect(store.accessToken()).toBe(token);

    // The next refresh is a new request.
    const c = store.refresh();
    http.expectOne(REFRESH).flush(sessionBody(adminToken({ jti: '2' })));
    await c;
  });

  it('ends the session on 401 and on 403', async () => {
    store.start(sessionBody(adminToken()));
    const first = store.refresh();
    http.expectOne(REFRESH).flush({ code: 'INVALID_TOKEN' }, { status: 401, statusText: '' });
    expect(await first).toBeNull();
    expect(store.isAuthenticated()).toBe(false);

    store.start(sessionBody(adminToken()));
    const second = store.refresh();
    http.expectOne(REFRESH).flush({ code: 'ADMIN_ACCESS_DENIED' }, { status: 403, statusText: '' });
    expect(await second).toBeNull();
    expect(store.isAuthenticated()).toBe(false);
  });

  it('keeps the session when the gateway fails, and rejects', async () => {
    const token = adminToken();
    store.start(sessionBody(token));
    const attempt = store.refresh();
    http.expectOne(REFRESH).flush('bad gateway', { status: 502, statusText: '' });

    await expect(attempt).rejects.toMatchObject({ status: 502 });
    expect(store.accessToken()).toBe(token);
  });

  it('restore() signs in from the cookie and never rejects', async () => {
    const ok = store.restore();
    http.expectOne(REFRESH).flush(sessionBody(adminToken()));
    await ok;
    expect(store.isAuthenticated()).toBe(true);

    store.clear();
    const down = store.restore();
    http.expectOne(REFRESH).error(new ProgressEvent('error'));
    await expect(down).resolves.toBeUndefined();
    expect(store.isAuthenticated()).toBe(false);
  });

  it('logout() clears the tab even when the call fails', async () => {
    store.start(sessionBody(adminToken()));
    const done = store.logout();
    await settle();
    http.expectOne('http://gw/api/v1/auth/admin/session/logout').error(new ProgressEvent('error'));
    await done;
    expect(store.isAuthenticated()).toBe(false);
  });
});
