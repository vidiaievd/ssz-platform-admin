import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { routes } from '../app.routes';
import { SessionStore } from '../core/auth/session.store';
import { adminToken, sessionBody, settle } from '../core/auth/testing';
import { APP_CONFIG } from '../core/config/app-config';
import { NAV_SECTIONS } from './nav-sections';
// Real English texts, so a missing key would show up as the key itself.
import en from '../../../public/i18n/en.json';

describe('Shell and panel routes', () => {
  let http: HttpTestingController;
  let session: SessionStore;

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
        // As in app.config.ts: route data reaches the pages as inputs.
        provideRouter(routes, withComponentInputBinding()),
        { provide: APP_CONFIG, useValue: { apiBaseUrl: 'http://gw' } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    session = TestBed.inject(SessionStore);
  });

  afterEach(() => http.verify());

  async function open(url: string, level = 'admin') {
    session.start(sessionBody(adminToken({ admin_level: level, email: 'ops@example.no' })));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    harness.detectChanges();
    // The dashboard at `/` reads its widgets; the shell tests do not care about their numbers.
    for (let i = 0; i < 4; i++) {
      await settle();
      TestBed.tick();
    }
    for (const req of http.match((r) => r.url.includes('/api/v1/admin/'))) {
      req.flush(null, { status: 503, statusText: 'Unavailable' });
    }
    await harness.fixture.whenStable();
    harness.detectChanges();
    const el = harness.fixture.nativeElement as HTMLElement;
    const text = (selector: string) => el.querySelector(selector)?.textContent?.trim() ?? null;
    return { harness, el, text };
  }

  it('shows who is signed in and the level', async () => {
    const { text } = await open('/');
    expect(text('[data-testid="shell-email"]')).toBe('ops@example.no');
    expect(text('[data-testid="level-badge"]')).toBe('Admin');
  });

  it('lists every section of the panel in the menu', async () => {
    const { el } = await open('/');
    const ids = Array.from(el.querySelectorAll('aside [data-testid^="nav-"]'), (a) =>
      a.getAttribute('data-testid')!.slice(4),
    );
    expect(ids).toEqual(NAV_SECTIONS.map((s) => s.id));
  });

  it('opens a section that is not built yet as "coming soon"', async () => {
    const { el, text } = await open('/users');
    expect(text('[data-testid="page-title"]')).toBe('Users');
    expect(el.querySelector('aside [data-testid="nav-users"]')?.getAttribute('aria-current')).toBe(
      'page',
    );
    expect(
      el.querySelector('aside [data-testid="nav-dashboard"]')?.getAttribute('aria-current'),
    ).toBeNull();
  });

  it('shows not-found for an unknown address inside the layout', async () => {
    const { text } = await open('/nowhere/at/all');
    expect(text('[data-testid="page-title"]')).toBe('Page not found');
    expect(text('[data-testid="level-badge"]')).toBe('Admin');
  });

  it('signs out on the server and goes to sign-in', async () => {
    const { el, harness } = await open('/users');
    el.querySelector<HTMLButtonElement>('[data-testid="sign-out"]')!.click();
    http.expectOne('http://gw/api/v1/auth/admin/session/logout').flush(null, {
      status: 204,
      statusText: 'No Content',
    });
    await settle();
    await harness.fixture.whenStable();

    expect(session.isAuthenticated()).toBe(false);
    expect(TestBed.inject(Router).url).toBe('/login');
  });
});
