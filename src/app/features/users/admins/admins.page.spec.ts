import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  TestRequest,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { routes } from '../../../app.routes';
import { provideApiClients } from '../../../core/api/provide-api-clients';
import { AdminLevel } from '../../../core/auth/admin-level';
import { AdminEntry } from '../../../core/auth/admins.api';
import { SessionStore } from '../../../core/auth/session.store';
import { adminToken, sessionBody, settle } from '../../../core/auth/testing';
import { APP_CONFIG } from '../../../core/config/app-config';
// Real English texts, so a missing key would show up as the key itself.
import en from '../../../../../public/i18n/en.json';

const ADMINS = 'http://gw/api/v1/auth/admin/admins';
const OTHER = '0b8f4c1e-2d3a-4f5b-8c6d-7e8f9a0b1c2d';

const entry = (overrides: Partial<AdminEntry> = {}): AdminEntry => ({
  userId: OTHER,
  email: 'kari@example.no',
  level: 'admin',
  grantedAt: '2026-11-01T10:00:00Z',
  grantedBy: 'admin-1',
  twoFactorEnabled: true,
  ...overrides,
});

/** The signed-in super (`sub: admin-1` in `adminToken`), bootstrapped. */
const SELF = entry({
  userId: 'admin-1',
  email: 'admin@example.no',
  level: 'super',
  grantedBy: null,
});

describe('AdminsPage', () => {
  let http: HttpTestingController;
  let harness: RouterTestingHarness;
  let el: HTMLElement;

  beforeEach(() => {
    // jsdom has no matchMedia; PrimeNG's select overlay asks it whether to open as a modal.
    window.matchMedia ??= ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    })) as typeof window.matchMedia;
    // jsdom has no scrollIntoView; PrimeNG's select scrolls to the chosen option.
    Element.prototype.scrollIntoView ??= () => undefined;
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

  afterEach(() => http.verify());

  async function stable(): Promise<void> {
    for (let i = 0; i < 4; i++) {
      await settle();
      TestBed.tick();
    }
  }

  async function next(url: string, method = 'GET'): Promise<TestRequest> {
    let req!: TestRequest;
    await vi.waitFor(async () => {
      await stable();
      const found = http.match((r) => r.url === url && r.method === method);
      expect(found).toHaveLength(1);
      req = found[0];
    });
    return req;
  }

  async function open(level: AdminLevel = 'super'): Promise<void> {
    TestBed.inject(SessionStore).start(sessionBody(adminToken({ admin_level: level })));
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/users/admins');
    el = harness.fixture.nativeElement as HTMLElement;
    await stable();
  }

  const find = (testId: string, root: ParentNode = el) =>
    root.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
  const text = (testId: string, root: ParentNode = el) =>
    find(testId, root)?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
  const row = (id: string) => find(`admin-${id}`)!;
  const inPage = (testId: string) => find(testId, document.body);

  async function dialogShown(): Promise<void> {
    await vi.waitFor(async () => {
      await stable();
      expect(inPage('reason-input')?.isConnected).toBe(true);
    });
  }

  async function pickLevel(label: string): Promise<void> {
    inPage('admin-level-select')!.querySelector<HTMLElement>('[role="combobox"]')!.click();
    await stable();
    const option = Array.from(document.body.querySelectorAll<HTMLElement>('[role="option"]')).find(
      (o) => o.textContent?.trim() === label,
    );
    option!.click();
    await stable();
  }

  async function confirmWith(reason: string): Promise<void> {
    const field = inPage('reason-input') as HTMLTextAreaElement;
    field.value = reason;
    field.dispatchEvent(new Event('input'));
    await stable();
    inPage('reason-confirm')!.click();
    await stable();
  }

  it('lists administrators with level, MFA and who granted, nothing on the own row', async () => {
    await open();
    (await next(ADMINS)).flush({
      items: [SELF, entry({ grantedBy: 'gone-admin', twoFactorEnabled: false })],
    });
    await stable();

    expect(text('admins-total')).toBe('2 in total');
    expect(text('admin-self', row('admin-1'))).toBe('you');
    expect(text('admin-granted-by', row('admin-1'))).toBe('bootstrap');
    expect(find('admin-change', row('admin-1'))).toBeNull();
    expect(find('admin-revoke', row('admin-1'))).toBeNull();

    const other = row(OTHER);
    expect(text('level-badge', other)).toBe('Admin');
    expect(text('admin-mfa', other)).toContain('Not set up');
    // A granter who is no longer an administrator is shown by id, still linking to the card.
    const by = find('admin-granted-by', other)!.querySelector('a')!;
    expect(by.textContent!.trim()).toBe('gone-admin');
    expect(by.getAttribute('href')).toBe('/users/gone-admin');
    expect(find('admin-change', other)).not.toBeNull();
  });

  it('shows the granter by e-mail when they are an administrator', async () => {
    await open();
    (await next(ADMINS)).flush({ items: [SELF, entry()] });
    await stable();
    expect(text('admin-granted-by', row(OTHER))).toBe('admin@example.no');
  });

  it('changes a level with a reason, then reads the list again', async () => {
    await open();
    (await next(ADMINS)).flush({ items: [SELF, entry()] });
    await stable();

    find('admin-change', row(OTHER))!.click();
    await dialogShown();
    expect(text('admin-level-text', document.body)).toContain('kari@example.no is Admin now');
    // The current level is not offered; nothing is sent until one is picked.
    await confirmWith('Needs the model screen');
    expect(text('admin-level-required', document.body)).toBe('This field is required.');
    expect(http.match((r) => r.method === 'PUT')).toHaveLength(0);
    inPage('admin-level-select')!.querySelector<HTMLElement>('[role="combobox"]')!.click();
    await stable();
    const labels = Array.from(document.body.querySelectorAll('[role="option"]')).map((o) =>
      o.textContent?.trim(),
    );
    expect(labels).toEqual(['Super admin', 'Support']);
    document.body.querySelector<HTMLElement>('[role="option"]')!.click();
    await stable();
    inPage('reason-confirm')!.click();

    const put = await next(`${ADMINS}/${OTHER}`, 'PUT');
    expect(put.request.body).toEqual({ level: 'super', reason: 'Needs the model screen' });
    put.flush(entry({ level: 'super' }));
    (await next(ADMINS)).flush({ items: [SELF, entry({ level: 'super' })] });
    await stable();
    expect(text('admins-notice')).toContain('kari@example.no is now Super admin.');
    expect(text('level-badge', row(OTHER))).toBe('Super admin');
  });

  it('removes an administrator, with the reason in the query', async () => {
    await open();
    (await next(ADMINS)).flush({ items: [SELF, entry()] });
    await stable();

    find('admin-revoke', row(OTHER))!.click();
    await dialogShown();
    expect(inPage('admin-level-select')).toBeNull();
    expect(text('admin-level-text', document.body)).toContain('kari@example.no (Admin) loses');
    await confirmWith('Left the team');

    const del = await next(`${ADMINS}/${OTHER}`, 'DELETE');
    expect(del.request.params.get('reason')).toBe('Left the team');
    del.flush(null, { status: 204, statusText: 'No Content' });
    (await next(ADMINS)).flush({ items: [SELF] });
    await stable();
    expect(text('admins-notice')).toContain('kari@example.no is no longer an administrator.');
    expect(find(`admin-${OTHER}`)).toBeNull();
  });

  it('says in the dialog that the last super stays', async () => {
    await open();
    (await next(ADMINS)).flush({ items: [SELF, entry({ level: 'super' })] });
    await stable();

    find('admin-change', row(OTHER))!.click();
    await dialogShown();
    await pickLevel('Admin');
    await confirmWith('Rotation');
    (await next(`${ADMINS}/${OTHER}`, 'PUT')).flush(
      { title: 'Bad Request', status: 400, code: 'ADMIN_LAST_SUPER' },
      { status: 400, statusText: 'Bad Request' },
    );
    await stable();
    expect(text('reason-error', document.body)).toContain(
      'This is the last super administrator who can sign in',
    );
    expect(text('reason-error-code', document.body)).toBe('ADMIN_LAST_SUPER');
  });

  it('offers a retry when the list fails', async () => {
    await open();
    (await next(ADMINS)).flush({}, { status: 500, statusText: 'Error' });
    await stable();
    expect(text('admins-error')).toContain('could not be read');
    find('admins-error')!.querySelector('button')!.click();
    (await next(ADMINS)).flush({ items: [SELF] });
    await stable();
    expect(find('admins-error')).toBeNull();
    expect(text('admins-total')).toBe('1 in total');
  });

  it('does not exist below super: the path is read as a user id', async () => {
    await open('admin');
    const req = await next('http://gw/api/v1/auth/admin/users/admins');
    req.flush({}, { status: 404, statusText: 'Not Found' });
    // The card's own read of the plan goes out alongside; answer it to keep the test clean.
    http.match((r) => r.url.endsWith('/accounts/lookup')).forEach((r) => r.flush({ items: [] }));
    await stable();
    expect(find('admins-table')).toBeNull();
    expect(find('user-not-found')).not.toBeNull();
  });
});
