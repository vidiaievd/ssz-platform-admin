import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { adminSchoolsList } from '../../api/organization/functions';
import { OrganizationApi } from '../../api/organization/organization-api';
import { adminAccountsLookup } from '../../api/subscription/functions';
import { SubscriptionApi } from '../../api/subscription/subscription-api';
import { publicProfilesGetProfilesByUserIds } from '../../api/user-profile/functions';
import { UserProfileApi } from '../../api/user-profile/user-profile-api';
import { authInterceptor } from '../auth/auth.interceptor';
import { SessionStore } from '../auth/session.store';
import { adminToken, sessionBody } from '../auth/testing';
import { APP_CONFIG } from '../config/app-config';
import { provideApiClients } from './provide-api-clients';

describe('provideApiClients', () => {
  let mock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: APP_CONFIG, useValue: { apiBaseUrl: 'http://gw' } },
        provideApiClients(),
      ],
    });
    mock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => mock.verify());

  it('sends every client to the gateway with the bearer', async () => {
    const token = adminToken();
    TestBed.inject(SessionStore).start(sessionBody(token));

    const page = firstValueFrom(
      TestBed.inject(OrganizationApi).invoke(adminSchoolsList, {
        search: 'oslo',
        status: 'active',
        limit: 25,
      }),
    );
    const req = mock.expectOne((r) => r.url === 'http://gw/api/v1/admin/schools');
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('search')).toBe('oslo');
    expect(req.request.params.get('status')).toBe('active');
    expect(req.request.params.get('limit')).toBe('25');
    expect(req.request.headers.get('Authorization')).toBe(`Bearer ${token}`);
    req.flush({ items: [], total: 0, page: 1, limit: 25 });
    expect(await page).toEqual({ items: [], total: 0, page: 1, limit: 25 });
  });

  it('configures the subscription and user-profile clients too', () => {
    TestBed.inject(SubscriptionApi)
      .invoke(adminAccountsLookup, { body: { type: 'workspace', ids: ['s-1'] } })
      .subscribe();
    const lookup = mock.expectOne('http://gw/api/v1/admin/subscriptions/accounts/lookup');
    expect(lookup.request.method).toBe('POST');
    expect(lookup.request.body).toEqual({ type: 'workspace', ids: ['s-1'] });
    lookup.flush({ items: [] });

    TestBed.inject(UserProfileApi)
      .invoke(publicProfilesGetProfilesByUserIds, { userIds: 'u-1,u-2' })
      .subscribe();
    const profiles = mock.expectOne((r) => r.url === 'http://gw/api/v1/profiles');
    expect(profiles.request.params.get('userIds')).toBe('u-1,u-2');
    profiles.flush([]);
  });
});
