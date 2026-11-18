import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  TestRequest,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { routes } from '../../app.routes';
import { provideApiClients } from '../../core/api/provide-api-clients';
import { AdminUserListItem } from '../../core/auth/admin-users.api';
import { SessionStore } from '../../core/auth/session.store';
import { adminToken, sessionBody, settle } from '../../core/auth/testing';
import { APP_CONFIG } from '../../core/config/app-config';
// Real English texts, so a missing key would show up as the key itself.
import en from '../../../../public/i18n/en.json';

const USERS = 'http://gw/api/v1/auth/admin/users';
const DAY_MS = 86_400_000;

function user(id: string, overrides: Partial<AdminUserListItem> = {}): AdminUserListItem {
  return {
    id,
    email: `${id}@example.no`,
    roles: ['student'],
    adminLevel: null,
    emailVerified: true,
    twoFactorEnabled: false,
    blockedAt: null,
    lockedUntil: null,
    deletionRequestedAt: null,
    purgeAt: null,
    createdAt: '2026-03-05T10:00:00.000Z',
    lastLoginAt: null,
    ...overrides,
  };
}

describe('UsersListPage', () => {
  let http: HttpTestingController;
  let harness: RouterTestingHarness;
  let el: HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [
        TranslocoTestingModule.forRoot({
          langs: { en },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
          preloadLangs: true,
        }),
      ],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter(routes, withComponentInputBinding()),
        { provide: APP_CONFIG, useValue: { apiBaseUrl: 'http://gw' } },
        provideApiClients(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(SessionStore).start(sessionBody(adminToken({ admin_level: 'support' })));
  });

  afterEach(() => http.verify());

  /** Not `whenStable()`: in a zoneless app it also waits for unanswered HTTP requests. */
  async function stable(): Promise<void> {
    for (let i = 0; i < 3; i++) {
      await settle();
      TestBed.tick();
    }
  }

  async function open(url: string): Promise<void> {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    el = harness.fixture.nativeElement as HTMLElement;
    await stable();
  }

  const text = (selector: string) => el.querySelector(selector)?.textContent?.trim() ?? null;
  const all = (selector: string) =>
    Array.from(el.querySelectorAll(selector), (n) => n.textContent?.replace(/\s+/g, ' ').trim());
  const url = () => TestBed.inject(Router).url;
  const expectUsers = (): TestRequest => http.expectOne((r) => r.url === USERS);

  async function answer(items: AdminUserListItem[], total = items.length): Promise<void> {
    expectUsers().flush({ items, total, page: 1, limit: 25 });
    await stable();
  }

  it('asks auth for the page the URL describes', async () => {
    await open('/users?q=ola&role=tutor&status=blocked&sort=email&page=2&size=50');
    const req = expectUsers();
    const params = req.request.params;
    expect(params.get('search')).toBe('ola');
    expect(params.get('role')).toBe('tutor');
    expect(params.get('status')).toBe('blocked');
    expect(params.get('sort')).toBe('email');
    expect(params.get('page')).toBe('2');
    expect(params.get('limit')).toBe('50');
    req.flush({ items: [], total: 0, page: 2, limit: 50 });
    await stable();
    expect(el.querySelector('[data-testid="users-search"]')).toHaveProperty('value', 'ola');
  });

  it('keeps a one-letter search in the box but does not send it', async () => {
    await open('/users?q=o');
    expect(expectUsers().request.params.has('search')).toBe(false);
    await stable();
    expect(text('[data-testid="users-search-short"]')).toBe(
      'Type at least 2 characters to search by e-mail.',
    );
  });

  it('shows roles, the admin level, the status badges, 2FA and the last sign-in', async () => {
    await open('/users');
    const soon = new Date(Date.now() + 3 * DAY_MS - 60_000).toISOString();
    await answer([
      user('ops', {
        roles: ['platform_admin'],
        adminLevel: 'admin',
        twoFactorEnabled: true,
        lastLoginAt: '2026-11-17T08:00:00Z',
      }),
      user('kari', {
        roles: ['student', 'premium'],
        blockedAt: '2026-11-10T00:00:00Z',
        emailVerified: false,
      }),
      user('per', { deletionRequestedAt: '2026-10-22T00:00:00Z', purgeAt: soon }),
    ]);

    // Inline pieces run together in textContent; spaces are dropped before comparing.
    expect(all('[data-testid="user-roles"]').map((t) => t?.replace(/\s/g, ''))).toEqual([
      'PlatformadminAdmin',
      'Student·Premium',
      'Student',
    ]);
    expect(all('[data-testid="user-roles"] [data-testid="level-badge"]')).toEqual(['Admin']);
    expect(all('[data-testid="user-badges"]').map((t) => t?.replace(/\s/g, ''))).toEqual([
      'Active',
      'BlockedE-mailnotconfirmed',
      'Deletedin3d',
    ]);
    expect(all('[data-testid="user-mfa"]')).toEqual(['Two-factor sign-in on', '—', '—']);
    expect(all('[data-testid="user-last-login"]')[1]).toBe('never');
    expect(text('[data-testid="users-total"]')).toBe('Found: 3');
  });

  it('opens the deletion requests, soonest erasure first, with the date column', async () => {
    await open('/users?role=student');
    await answer([user('a')]);
    expect(el.querySelector('[data-testid="sort-purgeAt"]')).toBeNull();

    el.querySelector<HTMLButtonElement>('[data-testid="users-deletion-preset"]')!.click();
    await stable();
    expect(url()).toBe('/users?role=student&status=deletion_pending&sort=purgeAt');
    const req = expectUsers();
    expect(req.request.params.get('status')).toBe('deletion_pending');
    expect(req.request.params.get('sort')).toBe('purgeAt');
    req.flush({
      items: [
        user('a', {
          deletionRequestedAt: '2026-10-22T00:00:00Z',
          purgeAt: '2026-11-21T00:00:00Z',
        }),
      ],
      total: 1,
      page: 1,
      limit: 25,
    });
    await stable();

    expect(text('[data-testid="page-title"]')).toBe('Deletion requests');
    expect(el.querySelector('[data-testid="sort-purgeAt"]')).not.toBeNull();
    expect(all('[data-testid="user-purge"]')[0]).toContain('2026');

    // Pressed again: back to every account, keeping the role.
    el.querySelector<HTMLButtonElement>('[data-testid="users-deletion-preset"]')!.click();
    await stable();
    expect(url()).toBe('/users?role=student');
    await answer([]);
  });

  it('says when no deletion is pending', async () => {
    await open('/users?status=deletion_pending&sort=purgeAt');
    await answer([]);
    expect(text('[data-testid="users-empty"]')).toBe('No pending deletion requests.');
  });

  it('sorts by a column header and starts from page 1', async () => {
    await open('/users?page=3');
    await answer([user('a')], 80);
    el.querySelector<HTMLButtonElement>('[data-testid="sort-email"]')!.click();
    await stable();
    expect(url()).toBe('/users?sort=email');
    await answer([user('a')]);

    el.querySelector<HTMLButtonElement>('[data-testid="sort-lastLoginAt"]')!.click();
    await stable();
    expect(url()).toBe('/users?sort=-lastLoginAt');
    await answer([user('a')]);
  });

  it('writes a filter to the URL and resets it', async () => {
    await open('/users?q=ola&status=blocked&size=50');
    await answer([], 0);
    expect(text('[data-testid="users-empty"]')).toContain('No accounts match these filters.');

    el.querySelector<HTMLButtonElement>('[data-testid="users-reset"]')!.click();
    await stable();
    expect(url()).toBe('/users?size=50');
    await answer([]);
  });

  it('keeps the table when a page fails and retries', async () => {
    await open('/users');
    expectUsers().flush(null, { status: 500, statusText: 'Server Error' });
    await stable();
    expect(text('[data-testid="users-error"]')).toContain('Could not load users.');

    el.querySelector<HTMLButtonElement>('[data-testid="users-error"] button')!.click();
    await stable();
    await answer([user('a')]);
    expect(el.querySelector('[data-testid="users-error"]')).toBeNull();
    expect(all('[data-testid="user-row"]')).toHaveLength(1);
  });

  it('opens the account from its row', async () => {
    await open('/users');
    await answer([user('a')]);
    el.querySelector<HTMLElement>('[data-testid="user-row"]')!.click();
    await vi.waitFor(() => expect(url()).toBe('/users/a'));
    // The card reads the account and its plan; this spec stops at the address.
    await vi.waitFor(() => expect(http.match(`${USERS}/a`)).toHaveLength(1));
    http.match((r) => r.url.endsWith('/accounts/lookup'));
  });
});
