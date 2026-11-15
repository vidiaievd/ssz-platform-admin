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
import { routes } from '../../../app.routes';
import { AdminLevel } from '../../../core/auth/admin-level';
import { provideApiClients } from '../../../core/api/provide-api-clients';
import { SessionStore } from '../../../core/auth/session.store';
import { adminToken, sessionBody, settle } from '../../../core/auth/testing';
import { TokenLifetimes } from '../../../core/auth/token-lifetimes.api';
import { APP_CONFIG } from '../../../core/config/app-config';
// Real English texts, so a missing key would show up as the key itself.
import en from '../../../../../public/i18n/en.json';

const URL = 'http://gw/api/v1/auth/admin/token-lifetimes';
const at = '2026-10-16T00:00:00Z';

const LIFETIMES: TokenLifetimes = {
  policies: [
    {
      role: 'platform_admin',
      clientType: 'admin',
      refreshLifetimeHours: 12,
      updatedAt: at,
      updatedBy: null,
    },
    {
      role: 'platform_admin',
      clientType: 'web',
      refreshLifetimeHours: 12,
      updatedAt: at,
      updatedBy: null,
    },
    {
      role: 'student',
      clientType: 'web',
      refreshLifetimeHours: 168,
      updatedAt: at,
      updatedBy: null,
    },
    {
      role: 'tutor',
      clientType: 'mobile',
      refreshLifetimeHours: 36,
      updatedAt: '2026-11-10T09:00:00Z',
      updatedBy: 'admin-1',
    },
  ],
  fallbackHours: 168,
  minHours: 1,
  maxHours: 2160,
};

describe('TokenLifetimesPage', () => {
  let http: HttpTestingController;
  let el: HTMLElement;

  beforeEach(() => {
    localStorage.setItem('ssz-admin.lang', 'en');
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
  });

  afterEach(() => {
    http.verify();
    localStorage.removeItem('ssz-admin.lang');
  });

  /** Not `whenStable()`: in a zoneless app it also waits for unanswered HTTP requests. */
  async function stable(): Promise<void> {
    for (let i = 0; i < 4; i++) {
      await settle();
      TestBed.tick();
    }
  }

  async function next(method = 'GET'): Promise<TestRequest> {
    let req!: TestRequest;
    await vi.waitFor(async () => {
      await stable();
      const found = http.match((r) => r.url === URL && r.method === method);
      expect(found).toHaveLength(1);
      req = found[0];
    });
    return req;
  }

  async function open(level: AdminLevel = 'super', url = '/platform/sessions'): Promise<void> {
    TestBed.inject(SessionStore).start(sessionBody(adminToken({ admin_level: level })));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    el = harness.fixture.nativeElement as HTMLElement;
  }

  async function openAnswered(level: AdminLevel = 'super'): Promise<void> {
    await open(level);
    (await next()).flush(LIFETIMES);
    await stable();
  }

  const find = <T extends HTMLElement = HTMLElement>(testId: string, root: ParentNode = el) =>
    root.querySelector<T>(`[data-testid="${testId}"]`);
  const inPage = <T extends HTMLElement = HTMLElement>(testId: string) =>
    find<T>(testId, document.body);
  const textOf = (node: Element | null) => node?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
  const cell = (role: string, client: string) =>
    el.querySelector<HTMLElement>(
      `[data-testid="sessions-row"][data-role="${role}"] [data-testid="sessions-cell"][data-client="${client}"]`,
    )!;

  async function dialogShown(): Promise<void> {
    await vi.waitFor(async () => {
      await stable();
      expect(inPage('lifetime-value')?.isConnected).toBe(true);
    });
  }

  async function type(testId: string, value: string): Promise<void> {
    const field = inPage<HTMLInputElement | HTMLTextAreaElement>(testId)!;
    field.value = value;
    field.dispatchEvent(new Event('input'));
    await stable();
  }

  async function confirm(): Promise<void> {
    inPage<HTMLButtonElement>('reason-confirm')!.click();
    await stable();
  }

  it('opens as the first tab of the Platform section', async () => {
    await open('support', '/platform');
    (await next()).flush(LIFETIMES);
    await stable();
    expect(TestBed.inject(Router).url).toBe('/platform/sessions');
    expect(find('platform-tab-sessions')?.getAttribute('aria-current')).toBe('page');
  });

  it('shows hours with days, the fallback and unused admin cells', async () => {
    await openAnswered();

    const roles = [...el.querySelectorAll('[data-testid="sessions-row"]')].map((r) =>
      r.getAttribute('data-role'),
    );
    expect(roles).toEqual([
      'platform_admin',
      'manager_platform',
      'school_admin',
      'teacher',
      'tutor',
      'student',
    ]);

    expect(textOf(find('cell-hours', cell('student', 'web')))).toBe('168 h');
    expect(textOf(find('cell-days', cell('student', 'web')))).toBe('7 d');
    expect(textOf(find('cell-updated', cell('student', 'web')))).toBe('default');

    expect(textOf(find('cell-days', cell('tutor', 'mobile')))).toBe('1 d 12 h');
    expect(textOf(find('cell-updated', cell('tutor', 'mobile')))).toContain('changed');

    // No row: the fallback, marked.
    expect(cell('student', 'mobile').getAttribute('data-kind')).toBe('fallback');
    expect(find('cell-fallback', cell('student', 'mobile'))).not.toBeNull();
    // Admin client of a role that never signs into the panel.
    expect(cell('student', 'admin').getAttribute('data-kind')).toBe('unused');
    expect(find('cell-edit', cell('student', 'admin'))).toBeNull();
    expect(cell('platform_admin', 'admin').getAttribute('data-kind')).toBe('set');

    expect(textOf(find('sessions-fallback'))).toContain('168 h');
    expect(textOf(find('sessions-applies'))).toContain('issued or refreshed after it');
  });

  it('lets lower levels read but not change', async () => {
    await openAnswered('admin');
    expect(find('sessions-table')).not.toBeNull();
    expect(el.querySelectorAll('[data-testid="cell-edit"]')).toHaveLength(0);
  });

  it('changes one pair in days, with a reason, and shows the answer', async () => {
    await openAnswered();
    find<HTMLButtonElement>('cell-edit', cell('student', 'web'))!.click();
    await dialogShown();

    // Opens in days: 168 h is whole days.
    expect(inPage<HTMLInputElement>('lifetime-value')!.value).toBe('7');
    expect(textOf(inPage('lifetime-unchanged'))).toContain('nothing to save');

    await type('lifetime-value', '30');
    expect(textOf(inPage('lifetime-preview'))).toBe('= 30 d');
    await type('reason-input', 'longer student sessions');
    await confirm();

    const put = await next('PUT');
    expect(put.request.body).toEqual({
      policies: [{ role: 'student', clientType: 'web', refreshLifetimeHours: 720 }],
      reason: 'longer student sessions',
    });
    put.flush({
      ...LIFETIMES,
      policies: LIFETIMES.policies.map((p) =>
        p.role === 'student' && p.clientType === 'web'
          ? {
              ...p,
              refreshLifetimeHours: 720,
              updatedBy: 'admin-1',
              updatedAt: '2026-11-15T10:00:00Z',
            }
          : p,
      ),
    });
    await stable();

    expect(textOf(find('cell-hours', cell('student', 'web')))).toBe('720 h');
    expect(textOf(find('cell-updated', cell('student', 'web')))).toContain('changed');
  });

  it('creates the row of a fallback pair even with the fallback value', async () => {
    await openAnswered();
    find<HTMLButtonElement>('cell-edit', cell('student', 'mobile'))!.click();
    await dialogShown();
    expect(textOf(inPage('lifetime-current'))).toContain('the fallback');
    expect(inPage('lifetime-unchanged')).toBeNull();

    await type('reason-input', 'pin the mobile lifetime');
    await confirm();
    const put = await next('PUT');
    expect(put.request.body.policies).toEqual([
      { role: 'student', clientType: 'mobile', refreshLifetimeHours: 168 },
    ]);
    put.flush(LIFETIMES);
    await stable();
  });

  it('refuses values out of bounds and keeps the server refusal in the dialog', async () => {
    await openAnswered();
    find<HTMLButtonElement>('cell-edit', cell('platform_admin', 'admin'))!.click();
    await dialogShown();
    expect(inPage<HTMLInputElement>('lifetime-value')!.value).toBe('12');

    await type('lifetime-value', '2161');
    expect(textOf(inPage('lifetime-error'))).toBe('From 1 h to 90 d.');
    await type('reason-input', 'too long');
    await confirm();
    expect(http.match((r) => r.method === 'PUT')).toHaveLength(0);

    await type('lifetime-value', '1.5');
    expect(textOf(inPage('lifetime-error'))).toBe('A whole number, please.');

    await type('lifetime-value', '8');
    await confirm();
    (await next('PUT')).flush(
      { code: 'TOKEN_LIFETIME_OUT_OF_BOUNDS' },
      { status: 422, statusText: 'Unprocessable Entity' },
    );
    await stable();
    expect(inPage('reason-error')).not.toBeNull();
    expect(inPage('lifetime-value')?.isConnected).toBe(true);
  });

  it('offers a retry when the read fails', async () => {
    await open();
    (await next()).flush(null, { status: 503, statusText: 'Unavailable' });
    await stable();
    expect(find('sessions-failed')).not.toBeNull();

    find<HTMLButtonElement>('sessions-failed')!.querySelector('button')!.click();
    (await next()).flush(LIFETIMES);
    await stable();
    expect(find('sessions-table')).not.toBeNull();
  });
});
