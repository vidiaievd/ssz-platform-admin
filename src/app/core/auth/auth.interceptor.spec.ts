import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { APP_CONFIG } from '../config/app-config';
import { authInterceptor } from './auth.interceptor';
import { SessionStore } from './session.store';
import { adminToken, sessionBody, settle } from './testing';

const API = 'http://gw/api/v1/admin/schools';
const REFRESH = 'http://gw/api/v1/auth/admin/session/refresh';

describe('authInterceptor', () => {
  let http: HttpClient;
  let mock: HttpTestingController;
  let store: SessionStore;
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: APP_CONFIG, useValue: { apiBaseUrl: 'http://gw' } },
      ],
    });
    http = TestBed.inject(HttpClient);
    mock = TestBed.inject(HttpTestingController);
    store = TestBed.inject(SessionStore);
    router = TestBed.inject(Router);
  });

  afterEach(() => mock.verify());

  const unauthorized = { status: 401, statusText: 'Unauthorized' };

  it('puts the bearer on gateway calls only', () => {
    const token = adminToken();
    store.start(sessionBody(token));

    http.get(API).subscribe();
    http.get('/i18n/uk.json').subscribe();
    http.get('http://elsewhere/api/x').subscribe();

    expect(mock.expectOne(API).request.headers.get('Authorization')).toBe(`Bearer ${token}`);
    expect(mock.expectOne('/i18n/uk.json').request.headers.has('Authorization')).toBe(false);
    expect(mock.expectOne('http://elsewhere/api/x').request.headers.has('Authorization')).toBe(
      false,
    );
  });

  it('leaves the session routes alone, 401 included', async () => {
    store.start(sessionBody(adminToken()));
    const call = firstValueFrom(http.post(`http://gw/api/v1/auth/admin/session/mfa`, {}));
    const req = mock.expectOne('http://gw/api/v1/auth/admin/session/mfa');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({ code: 'INVALID_TOTP_CODE' }, unauthorized);

    await expect(call).rejects.toMatchObject({ status: 401 });
    // No refresh was attempted (verify() in afterEach would catch it).
  });

  it('refreshes once on 401 and repeats the request with the new token', async () => {
    store.start(sessionBody(adminToken({ jti: 'old' })));
    const result = firstValueFrom(http.get<{ ok: boolean }>(API));

    mock.expectOne(API).flush(null, unauthorized);
    const fresh = adminToken({ jti: 'new' });
    mock.expectOne(REFRESH).flush(sessionBody(fresh));
    await settle();

    const retry = mock.expectOne(API);
    expect(retry.request.headers.get('Authorization')).toBe(`Bearer ${fresh}`);
    retry.flush({ ok: true });
    expect(await result).toEqual({ ok: true });
  });

  it('shares one refresh between parallel 401s', async () => {
    store.start(sessionBody(adminToken({ jti: 'old' })));
    const a = firstValueFrom(http.get(`${API}?page=1`));
    const b = firstValueFrom(http.get(`${API}?page=2`));

    mock.expectOne(`${API}?page=1`).flush(null, unauthorized);
    mock.expectOne(`${API}?page=2`).flush(null, unauthorized);
    mock.expectOne(REFRESH).flush(sessionBody(adminToken({ jti: 'new' })));
    await settle();

    mock.expectOne(`${API}?page=1`).flush({ page: 1 });
    mock.expectOne(`${API}?page=2`).flush({ page: 2 });
    expect(await a).toEqual({ page: 1 });
    expect(await b).toEqual({ page: 2 });
  });

  it('retries with a token another request already refreshed', async () => {
    store.start(sessionBody(adminToken({ jti: 'old' })));
    const result = firstValueFrom(http.get(API));
    const first = mock.expectOne(API);

    const fresh = adminToken({ jti: 'new' });
    store.start(sessionBody(fresh));
    first.flush(null, unauthorized);
    await settle();

    const retry = mock.expectOne(API);
    expect(retry.request.headers.get('Authorization')).toBe(`Bearer ${fresh}`);
    retry.flush({});
    await result;
  });

  it('does not repeat a second time when the retry is also 401', async () => {
    store.start(sessionBody(adminToken({ jti: 'old' })));
    const result = firstValueFrom(http.get(API));

    mock.expectOne(API).flush(null, unauthorized);
    mock.expectOne(REFRESH).flush(sessionBody(adminToken({ jti: 'new' })));
    await settle();
    mock.expectOne(API).flush(null, unauthorized);

    await expect(result).rejects.toMatchObject({ status: 401 });
  });

  it('sends the administrator to /login when the session is over', async () => {
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    store.start(sessionBody(adminToken()));
    const result = firstValueFrom(http.get(API));

    mock.expectOne(API).flush(null, unauthorized);
    mock.expectOne(REFRESH).flush({ code: 'INVALID_TOKEN' }, unauthorized);

    await expect(result).rejects.toMatchObject({ status: 401 });
    expect(store.isAuthenticated()).toBe(false);
    expect(navigate).toHaveBeenCalledWith(['/login'], { queryParams: {} });
  });

  it('passes the 401 on, signed in, when the refresh itself could not reach the gateway', async () => {
    const navigate = vi.spyOn(router, 'navigate');
    store.start(sessionBody(adminToken()));
    const result = firstValueFrom(http.get(API));

    mock.expectOne(API).flush(null, unauthorized);
    mock.expectOne(REFRESH).error(new ProgressEvent('error'));

    await expect(result).rejects.toMatchObject({ status: 401 });
    expect(store.isAuthenticated()).toBe(true);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('does not touch other errors', async () => {
    store.start(sessionBody(adminToken()));
    const result = firstValueFrom(http.get(API));
    mock.expectOne(API).flush(null, { status: 403, statusText: 'Forbidden' });
    await expect(result).rejects.toMatchObject({ status: 403 });
  });
});
