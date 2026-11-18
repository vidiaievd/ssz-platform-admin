import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { APP_CONFIG } from '../config/app-config';
import { ApiError } from './api-error';
import { TokenLifetimes, TokenLifetimesApi } from './token-lifetimes.api';

const URL = 'http://gw/api/v1/auth/admin/token-lifetimes';

const LIFETIMES: TokenLifetimes = {
  policies: [
    {
      role: 'student',
      clientType: 'mobile',
      refreshLifetimeHours: 2160,
      updatedAt: '2026-10-16T12:00:00Z',
      updatedBy: null,
    },
  ],
  fallbackHours: 168,
  minHours: 1,
  maxHours: 2160,
};

describe('TokenLifetimesApi', () => {
  let api: TokenLifetimesApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: APP_CONFIG, useValue: { apiBaseUrl: 'http://gw' } },
      ],
    });
    api = TestBed.inject(TokenLifetimesApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists the lifetimes through the gateway', async () => {
    const result = firstValueFrom(api.list());
    const req = http.expectOne(URL);
    expect(req.request.method).toBe('GET');
    req.flush(LIFETIMES);

    expect(await result).toEqual(LIFETIMES);
  });

  it('sends the changes with the reason', async () => {
    const result = firstValueFrom(
      api.update(
        [{ role: 'student', clientType: 'web', refreshLifetimeHours: 336 }],
        'shorter web sessions',
      ),
    );
    const req = http.expectOne(URL);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({
      policies: [{ role: 'student', clientType: 'web', refreshLifetimeHours: 336 }],
      reason: 'shorter web sessions',
    });
    req.flush(LIFETIMES);

    expect(await result).toEqual(LIFETIMES);
  });

  it('turns a refusal into ApiError', async () => {
    const result = firstValueFrom(api.update([], 'x')).catch((error: unknown) => error);
    http
      .expectOne(URL)
      .flush(
        { title: 'Forbidden', status: 403, code: 'ADMIN_ACCESS_DENIED' },
        { status: 403, statusText: 'Forbidden' },
      );

    const error = await result;
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(403);
    expect((error as ApiError).code).toBe('ADMIN_ACCESS_DENIED');
  });
});
