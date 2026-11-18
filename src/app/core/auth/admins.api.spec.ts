import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { APP_CONFIG } from '../config/app-config';
import { AdminEntry, AdminsApi } from './admins.api';
import { ApiError } from './api-error';

const URL = 'http://gw/api/v1/auth/admin/admins';
const ID = '0b8f4c1e-2d3a-4f5b-8c6d-7e8f9a0b1c2d';

const ENTRY: AdminEntry = {
  userId: ID,
  email: 'kari@example.no',
  level: 'admin',
  grantedAt: '2026-11-01T10:00:00Z',
  grantedBy: null,
  twoFactorEnabled: true,
};

describe('AdminsApi', () => {
  let api: AdminsApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: APP_CONFIG, useValue: { apiBaseUrl: 'http://gw' } },
      ],
    });
    api = TestBed.inject(AdminsApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists the administrators', async () => {
    const result = firstValueFrom(api.list());
    const req = http.expectOne(URL);
    expect(req.request.method).toBe('GET');
    req.flush({ items: [ENTRY] });

    expect(await result).toEqual([ENTRY]);
  });

  it('sets a level with the reason', async () => {
    const result = firstValueFrom(api.set(ID, 'super', 'second super'));
    const req = http.expectOne(`${URL}/${ID}`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ level: 'super', reason: 'second super' });
    req.flush({ ...ENTRY, level: 'super' });

    expect((await result).level).toBe('super');
  });

  it('revokes with the reason in the query string', async () => {
    const result = firstValueFrom(api.revoke(ID, 'left the team'));
    const req = http.expectOne((r) => r.url === `${URL}/${ID}`);
    expect(req.request.method).toBe('DELETE');
    expect(req.request.params.get('reason')).toBe('left the team');
    expect(req.request.body).toBeNull();
    req.flush(null, { status: 204, statusText: 'No Content' });

    await result;
  });

  it('turns a refusal into ApiError', async () => {
    const result = firstValueFrom(api.revoke(ID, 'x')).catch((error: unknown) => error);
    http
      .expectOne((r) => r.url === `${URL}/${ID}`)
      .flush(
        { title: 'Bad Request', status: 400, code: 'ADMIN_LAST_SUPER' },
        { status: 400, statusText: 'Bad Request' },
      );

    const error = await result;
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('ADMIN_LAST_SUPER');
  });
});
