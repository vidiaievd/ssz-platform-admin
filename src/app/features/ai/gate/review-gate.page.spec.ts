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
import { provideApiClients } from '../../../core/api/provide-api-clients';
import { SessionStore } from '../../../core/auth/session.store';
import { adminToken, sessionBody, settle } from '../../../core/auth/testing';
import { APP_CONFIG } from '../../../core/config/app-config';
import { presetRange } from '../spend/spend-period';
import { models, providers } from '../providers/provider-fixtures';
import { capabilities, gateResponse } from './gate-fixtures';
// Real English texts, so a missing key would show up as the key itself.
import en from '../../../../../public/i18n/en.json';

const GATE = 'http://gw/api/v1/admin/ai/review-gate';
const BINDINGS = 'http://gw/api/v1/admin/ai/bindings';
const MODELS = 'http://gw/api/v1/admin/ai/models';
const PROVIDERS = 'http://gw/api/v1/admin/ai/providers';

describe('ReviewGatePage', () => {
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

  async function stable(): Promise<void> {
    for (let i = 0; i < 4; i++) {
      await settle();
      TestBed.tick();
    }
  }

  async function next(url: string): Promise<TestRequest> {
    let req!: TestRequest;
    await vi.waitFor(async () => {
      await stable();
      const found = http.match((r) => r.url === url);
      expect(found).toHaveLength(1);
      req = found[0];
    });
    return req;
  }

  /** Opens the tab and answers the side reads (binding, registry); returns the gate read. */
  async function open(path = '/ai/gate', direct = capabilities()): Promise<TestRequest> {
    TestBed.inject(SessionStore).start(sessionBody(adminToken({ admin_level: 'support' })));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(path);
    el = harness.fixture.nativeElement as HTMLElement;
    const gate = await next(GATE);
    (await next(BINDINGS)).flush(direct);
    (await next(MODELS)).flush(models);
    (await next(PROVIDERS)).flush(providers);
    return gate;
  }

  const find = (testId: string, root: ParentNode = el) =>
    root.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
  const textOf = (node: Element | null) => node?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
  const rows = () => [...el.querySelectorAll<HTMLElement>('[data-testid="gate-row"]')];

  it('is a tab of the AI section and reads all time by default', async () => {
    const req = await open();
    expect(req.request.params.has('from')).toBe(false);
    expect(req.request.params.has('to')).toBe(false);
    req.flush(gateResponse());
    await stable();

    expect(find('ai-tab-gate')?.getAttribute('aria-current')).toBe('page');
    expect(find('gate-preset-all')?.getAttribute('aria-pressed')).toBe('true');
    expect(textOf(find('gate-tariff-warning'))).toContain('ai.review_direct');
  });

  it('names the review_direct models and the thresholds', async () => {
    (await open()).flush(gateResponse());
    await stable();

    expect(textOf(find('gate-bound-primary'))).toBe('Sonnet');
    expect(textOf(find('gate-bound-fallback'))).toBe('· fallback Gemini Flash');
    expect(textOf(find('gate-thresholds'))).toContain('at least 100 drafts');
    expect(textOf(find('gate-thresholds'))).toContain('85%');
    expect(textOf(find('gate-thresholds'))).toContain('10%');
    expect(textOf(find('gate-count-passed'))).toBe('1');
    expect(textOf(find('gate-count-failed'))).toBe('1');
    expect(textOf(find('gate-count-insufficient'))).toBe('0');
    expect(textOf(find('gate-summary-not-recorded'))).toContain('50 drafts');
  });

  it('shows each template × model with shares, misses in red and the verdict', async () => {
    (await open()).flush(gateResponse());
    await stable();

    const [short, translate, flash, old] = rows();
    expect(rows()).toHaveLength(4);
    expect(short.dataset['role']).toBe('primary');
    expect(textOf(find('gate-role', short))).toBe('review_direct');
    expect(textOf(find('gate-kept', short))).toBe('90%');
    expect(textOf(find('gate-remarks', short))).toBe('80 / 10 / 8 / 2');
    expect(textOf(find('gate-direct', short))).toContain('30 delivered, 2 disputed');
    expect(textOf(find('gate-direct', short))).toContain('teacher overturned 1 of 4');
    expect(textOf(find('gate-verdict', short))).toBe('passed');

    expect(find('gate-discarded', translate)?.dataset['ok']).toBe('false');
    expect(find('gate-discarded', translate)?.className).toContain('text-red-600');
    expect(textOf(find('gate-verdict', translate))).toBe('not passed');

    expect(textOf(find('gate-role', flash))).toBe('review_direct fallback');
    expect(textOf(find('gate-verdict', flash))).toBe('not enough data');

    expect(textOf(old.querySelector('td'))).toBe('template not recorded');
    expect(find('gate-kept', old)?.dataset['ok']).toBeUndefined();
  });

  it('narrows to the review_direct model through the URL', async () => {
    (await open()).flush(gateResponse());
    await stable();

    find('gate-bound-only')!.click();
    await stable();
    expect(TestBed.inject(Router).url).toContain('bound=1');
    expect(rows()).toHaveLength(3);
    expect(rows().every((r) => r.dataset['role'] === 'primary')).toBe(true);
  });

  it('says when review_direct is unbound and marks no row', async () => {
    (await open('/ai/gate', capabilities(null))).flush(gateResponse());
    await stable();

    expect(find('gate-unbound')).not.toBeNull();
    expect(find('gate-summary-bound')).toBeNull();
    expect(find('gate-bound-only')).toBeNull();
    expect(rows().every((r) => !r.dataset['role'])).toBe(true);
  });

  it('reads a preset period and a hand-picked one from the URL', async () => {
    (await open()).flush(gateResponse());
    await stable();

    find('gate-preset-30')!.click();
    const req = await next(GATE);
    expect(req.request.params.get('from')).toBe(presetRange('30').from);
    expect(req.request.params.get('to')).toBe(presetRange('30').to);
    req.flush(gateResponse());
    await stable();
    expect(find('gate-preset-30')?.getAttribute('aria-pressed')).toBe('true');
  });

  it('passes one open end as given', async () => {
    const req = await open('/ai/gate?from=2026-10-01');
    expect(req.request.params.get('from')).toBe('2026-10-01');
    expect(req.request.params.has('to')).toBe(false);
    req.flush(gateResponse());
    await stable();
    expect(el.querySelector('[data-testid^="gate-preset-"][aria-pressed="true"]')).toBeNull();
  });

  it('refuses a reversed range typed by hand', async () => {
    (await open('/ai/gate?to=2026-10-01')).flush(gateResponse());
    await stable();

    const from = find('gate-from') as HTMLInputElement;
    from.value = '2026-11-01';
    from.dispatchEvent(new Event('change'));
    await stable();
    expect(find('gate-range-refused')).not.toBeNull();
    expect(http.match(GATE)).toHaveLength(0);
  });

  it('says when nothing was settled', async () => {
    (await open()).flush(gateResponse({ groups: [] }));
    await stable();
    expect(textOf(find('gate-empty'))).toBe('Teachers have settled no AI drafts in this period.');
  });

  it('offers a retry when analytics fails', async () => {
    (await open()).flush(null, { status: 503, statusText: 'Unavailable' });
    await stable();
    expect(find('gate-failed')).not.toBeNull();
  });
});
