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
import {
  LEARNER,
  SCHOOL_A,
  SCHOOL_B,
  capabilitiesResponse,
  payersResponse,
  weeksResponse,
} from './payer-spend-fixtures';
import { spendResponse } from './spend-fixtures';
import { presetRange } from './spend-period';
// Real English texts, so a missing key would show up as the key itself.
import en from '../../../../../public/i18n/en.json';

const SPEND = 'http://gw/api/v1/admin/ai/spend';
const USAGE = 'http://gw/api/v1/admin/ai/usage';
const SCHOOLS = 'http://gw/api/v1/admin/schools';
const PROFILES = 'http://gw/api/v1/profiles';

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
    // The per-payer block reads on its own; tests of the first block leave it unanswered.
    http.match((r) => [USAGE, SCHOOLS, PROFILES].includes(r.url));
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
  describe('credits by payer (step 17)', () => {
    async function usage(groupBy: string): Promise<TestRequest> {
      let req!: TestRequest;
      await vi.waitFor(async () => {
        await stable();
        const found = http.match((r) => r.url === USAGE && r.params.get('groupBy') === groupBy);
        expect(found).toHaveLength(1);
        req = found[0];
      });
      return req;
    }

    async function names(url: string): Promise<TestRequest> {
      let req!: TestRequest;
      await vi.waitFor(async () => {
        await stable();
        const found = http.match((r) => r.url === url);
        expect(found).toHaveLength(1);
        req = found[0];
      });
      return req;
    }

    const school = (id: string, name: string, slug: string) => ({
      id,
      name,
      slug,
      kind: 'SOLO',
      ownerId: 'o',
      city: null,
      status: 'active',
      createdAt: '2026-10-01T00:00:00Z',
      closesAt: null,
      purgeAt: null,
      counts: { students: 0, teachers: 0 },
      seats: { used: 0, limit: null },
    });

    async function openAll(path = '/ai/spend') {
      (await open(path)).flush(spendResponse());
      const payers = await usage('payer');
      const caps = await usage('capability');
      const weeks = await usage('week');
      return { payers, caps, weeks };
    }

    const payerRow = (id: string) =>
      el.querySelector<HTMLElement>(`[data-testid="payer-row"][data-payer="${id}"]`)!;

    it('reads the top 20, agents and weeks for the page period, then names the top', async () => {
      const { payers, caps, weeks } = await openAll();
      const range = presetRange('30');
      for (const r of [payers, caps, weeks]) {
        expect(r.request.params.get('from')).toBe(range.from);
        expect(r.request.params.get('to')).toBe(range.to);
        expect(r.request.params.has('payerType')).toBe(false);
      }
      expect(payers.request.params.get('limit')).toBe('20');
      payers.flush(payersResponse());
      caps.flush(capabilitiesResponse());
      weeks.flush(weeksResponse());

      const schools = await names(SCHOOLS);
      expect(schools.request.params.get('ids')).toBe(`${SCHOOL_A},${SCHOOL_B}`);
      expect(schools.request.params.get('limit')).toBe('2');
      schools.flush({
        items: [school(SCHOOL_A, 'My students', 'anna-k')],
        total: 1,
        page: 1,
        limit: 2,
      });
      const profiles = await names(PROFILES);
      expect(profiles.request.params.get('userIds')).toBe(LEARNER);
      profiles.flush([{ userId: LEARNER, displayName: 'Olena' }]);
      await stable();

      expect(textOf(find('payers-total'))).toBe(
        '796.16 credits · 1,201 calls · 6 payers · no price: 4',
      );
      const a = payerRow(SCHOOL_A);
      expect(textOf(find('payer-name', a))).toBe('My students');
      expect(find('payer-name', a)?.getAttribute('href')).toBe(`/schools/${SCHOOL_A}`);
      expect(textOf(a)).toContain('anna-k');
      expect(textOf(find('payer-credits', a))).toBe('398.08');
      expect(textOf(find('payer-share', a))).toBe('50%');
      expect(textOf(find('payer-name', payerRow(LEARNER)))).toBe('Olena');
      // A school organization did not return keeps its id.
      expect(textOf(find('payer-name', payerRow(SCHOOL_B)))).toBe(SCHOOL_B);
      expect(textOf(find('payer-others'))).toContain('3 more payers');
      expect(find('payer-names-failed')).toBeNull();

      const capRows = el.querySelectorAll<HTMLElement>('[data-testid="capability-usage-row"]');
      expect([...capRows].map((r) => r.dataset['capability'])).toEqual([
        'review_draft',
        'student_assist',
      ]);
      const weekRows = el.querySelectorAll<HTMLElement>('[data-testid="week-row"]');
      expect(weekRows).toHaveLength(3);
      expect(find('week-bar', weekRows[0])).toBeNull();
      expect(find('week-bar', weekRows[1])?.style.width).toBe('100%');
    });

    it('filters by payer kind through the URL and reads all three again', async () => {
      const { payers, caps, weeks } = await openAll();
      payers.flush(payersResponse({ items: [], others: null, payers: 0 }));
      caps.flush(capabilitiesResponse());
      weeks.flush(weeksResponse());
      await stable();
      expect(find('payers-empty')).not.toBeNull();
      expect(find('payer-filter-all')?.getAttribute('aria-pressed')).toBe('true');

      find('payer-filter-user')!.click();
      const again = [await usage('payer'), await usage('capability'), await usage('week')];
      for (const r of again) expect(r.request.params.get('payerType')).toBe('user');
      expect(TestBed.inject(Router).url).toContain('payer=user');
      // The first block keeps its period and is not read again.
      expect(http.match((r) => r.url === SPEND)).toHaveLength(0);
    });

    it('fails one read at a time, and shows ids when names cannot be read', async () => {
      const { payers, caps, weeks } = await openAll();
      payers.flush(payersResponse());
      caps.flush(null, { status: 503, statusText: 'Unavailable' });
      weeks.flush(weeksResponse());
      (await names(SCHOOLS)).flush(null, { status: 503, statusText: 'Unavailable' });
      (await names(PROFILES)).flush([{ userId: LEARNER, displayName: 'Olena' }]);
      await stable();

      expect(find('capabilities-failed')).not.toBeNull();
      expect(find('payers-table')).not.toBeNull();
      expect(el.querySelectorAll('[data-testid="week-row"]')).toHaveLength(3);
      expect(find('payer-names-failed')).not.toBeNull();
      expect(textOf(find('payer-name', payerRow(SCHOOL_A)))).toBe(SCHOOL_A);
      expect(textOf(find('payer-name', payerRow(LEARNER)))).toBe('Olena');

      (find('capabilities-failed')!.querySelector('button') as HTMLButtonElement).click();
      (await usage('capability')).flush(capabilitiesResponse());
      await stable();
      expect(find('capabilities-failed')).toBeNull();
    });

    it('the page refresh reads both blocks', async () => {
      const { payers, caps, weeks } = await openAll();
      payers.flush(payersResponse({ items: [], others: null }));
      caps.flush(capabilitiesResponse());
      weeks.flush(weeksResponse());
      await stable();

      find('spend-refresh')!.click();
      (await next()).flush(spendResponse());
      (await usage('payer')).flush(payersResponse({ items: [], others: null }));
      (await usage('capability')).flush(capabilitiesResponse());
      (await usage('week')).flush(weeksResponse());
    });
  });
});
