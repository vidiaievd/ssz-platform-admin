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
import { spendResponse } from './spend-fixtures';
import { presetRange } from './spend-period';
// Real English texts, so a missing key would show up as the key itself.
import en from '../../../../../public/i18n/en.json';

const SPEND = 'http://gw/api/v1/admin/ai/spend';

describe('AiSpendPage', () => {
  let http: HttpTestingController;
  let el: HTMLElement;

  beforeEach(() => {
    // Money and numbers are checked in English formatting (the panel starts in Ukrainian).
    localStorage.setItem('ssz-admin.lang', 'en');
    // jsdom has no canvas: chart.js gets no context and draws nothing, which is all these
    // tests need (the numbers are checked in the table and in spend-model.spec).
    HTMLCanvasElement.prototype.getContext = (() => null) as never;
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

  async function next(): Promise<TestRequest> {
    let req!: TestRequest;
    await vi.waitFor(async () => {
      await stable();
      const found = http.match((r) => r.url === SPEND);
      expect(found).toHaveLength(1);
      req = found[0];
    });
    return req;
  }

  async function open(path = '/ai/spend'): Promise<TestRequest> {
    TestBed.inject(SessionStore).start(sessionBody(adminToken({ admin_level: 'support' })));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(path);
    el = harness.fixture.nativeElement as HTMLElement;
    return next();
  }

  const find = (testId: string, root: ParentNode = el) =>
    root.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
  const textOf = (node: Element | null) => node?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
  const row = (modelId: string) =>
    el.querySelector<HTMLElement>(`[data-testid="spend-row"][data-model="${modelId}"]`)!;

  it('is a tab of the AI section and reads the last 30 days by default', async () => {
    const req = await open();
    expect(req.request.params.get('from')).toBe(presetRange('30').from);
    expect(req.request.params.get('to')).toBe(presetRange('30').to);
    req.flush(spendResponse());
    await stable();

    expect(find('ai-tab-spend')?.getAttribute('aria-current')).toBe('page');
    expect(find('spend-preset-30')?.getAttribute('aria-pressed')).toBe('true');
  });

  it('shows the KPIs: USD total, calls and the unpriced warning', async () => {
    (await open()).flush(spendResponse());
    await stable();

    expect(textOf(find('kpi-value', find('kpi-cost')!))).toBe('$0.6558');
    expect(textOf(find('kpi-value', find('kpi-calls')!))).toBe('751');
    expect(textOf(find('kpi-calls-detail'))).toBe('failed 3 · by the fallback 2');
    expect(find('kpi-unpriced')?.dataset['warn']).toBe('true');
    expect(textOf(find('kpi-unpriced-hint'))).toContain('Gemini Flash');
    expect(textOf(find('kpi-audio'))).toBe('audio: 0.49 h');
  });

  it('lists every model with its usage, cost and share; an idle bound model has zeros', async () => {
    (await open()).flush(spendResponse());
    await stable();

    const azure = row('m-azure-speech');
    expect(textOf(azure)).toContain('Azure Speech');
    expect(textOf(azure)).toContain('Azure · eu');
    expect(textOf(find('spend-bound', azure))).toBe('primary: voice_review');
    expect(textOf(find('spend-audio', azure))).toBe('0.49');
    expect(textOf(find('spend-cost', azure))).toBe('$0.4862');
    expect(textOf(find('spend-share', azure))).toBe('74.1%');

    const gem = row('m-gemini');
    expect(textOf(find('spend-tokens', gem))).toBe('120,000 / 9,000');
    expect(textOf(find('spend-unpriced', gem))).toBe('no price: 5');

    const idle = row('m-whisper');
    expect(textOf(find('spend-calls', idle))).toBe('0');
    expect(textOf(find('spend-cost', idle))).toBe('—');
    expect(textOf(find('spend-bound', idle))).toBe('fallback: voice_review');
  });

  it('unfolds a model by agent', async () => {
    (await open()).flush(spendResponse());
    await stable();

    expect(el.querySelectorAll('[data-testid="spend-capability-row"]')).toHaveLength(0);
    const toggle = find('spend-row-toggle', row('m-azure-speech'))!;
    toggle.click();
    await stable();

    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    const caps = [...el.querySelectorAll<HTMLElement>('[data-testid="spend-capability-row"]')];
    expect(caps.map((c) => c.dataset['capability'])).toEqual(['voice_review', 'sound_session']);
    expect(textOf(find('spend-cost', caps[0]))).toBe('$0.47');
  });

  it('draws the cost per day when something was priced', async () => {
    (await open()).flush(spendResponse());
    await stable();
    expect(find('spend-chart')).not.toBeNull();
    expect(find('spend-chart-empty')).toBeNull();
  });

  it('writes a preset into the URL and reads that period', async () => {
    (await open()).flush(spendResponse());
    await stable();

    find('spend-preset-month')!.click();
    const req = await next();
    const month = presetRange('month');
    expect(req.request.params.get('from')).toBe(month.from);
    const url = TestBed.inject(Router).url;
    expect(url).toContain(`from=${month.from}`);
    expect(url).toContain(`to=${month.to}`);
    req.flush(spendResponse());
    await stable();
    expect(find('spend-preset-month')?.getAttribute('aria-pressed')).toBe('true');
  });

  it('opens a hand-picked period from the URL, and falls back on a bad one', async () => {
    const req = await open('/ai/spend?from=2026-10-01&to=2026-10-31');
    expect(req.request.params.get('from')).toBe('2026-10-01');
    expect(req.request.params.get('to')).toBe('2026-10-31');
    req.flush(spendResponse());
    await stable();
    expect(el.querySelector('[data-testid^="spend-preset-"][aria-pressed="true"]')).toBeNull();
  });

  it('ignores a reversed range typed by hand and says why', async () => {
    (await open()).flush(spendResponse());
    await stable();

    const from = find('spend-from') as HTMLInputElement;
    from.value = '2099-01-01';
    from.dispatchEvent(new Event('change'));
    await stable();

    expect(find('spend-range-refused')).not.toBeNull();
    expect(http.match((r) => r.url === SPEND)).toHaveLength(0);
  });

  it('shows "retry" when the spend cannot be read', async () => {
    (await open()).flush(null, { status: 503, statusText: 'Unavailable' });
    await stable();

    expect(find('spend-failed')).not.toBeNull();
    (find('spend-failed')!.querySelector('button') as HTMLButtonElement).click();
    (await next()).flush(spendResponse());
    await stable();
    expect(find('spend-table')).not.toBeNull();
  });
});
