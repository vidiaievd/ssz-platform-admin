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
import { SessionStore } from '../../core/auth/session.store';
import { adminToken, sessionBody, settle } from '../../core/auth/testing';
import { APP_CONFIG } from '../../core/config/app-config';
// Real English texts, so a missing key would show up as the key itself.
import en from '../../../../public/i18n/en.json';

const STATS = 'http://gw/api/v1/admin/stats';
const QUEUE = 'http://gw/api/v1/admin/subscriptions/stats';
const USAGE = 'http://gw/api/v1/admin/ai/usage';
const SPEND = 'http://gw/api/v1/admin/ai/spend';
const SCHOOLS = 'http://gw/api/v1/admin/schools';
const unavailable = { status: 503, statusText: 'Unavailable' };

const SCHOOL_A = '6f1c2a9e-0b7d-4e3a-9c55-1d2e3f4a5b6c';
const SCHOOL_B = '0a1b2c3d-4e5f-5a6b-8c7d-9e0f1a2b3c4d';
const tokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
const figures = (credits: string, calls = 10) => ({ calls, credits, unpricedCalls: 0, tokens });
const cap = (capability: string, credits: string) => ({ capability, ...figures(credits) });

/** Credits by ISO week, split by capability (analytics `groupBy=week`). */
const aiWeeks = {
  from: '2026-10-12',
  to: '2026-11-10',
  groupBy: 'week',
  payerType: null,
  total: { ...figures('150.000000', 120), unpricedCalls: 2 },
  items: [
    {
      week: '2026-W44',
      from: '2026-10-26',
      to: '2026-11-01',
      ...figures('100.000000'),
      byCapability: [cap('review_draft', '70.000000'), cap('practice', '30.000000')],
    },
    {
      week: '2026-W45',
      from: '2026-11-02',
      to: '2026-11-08',
      ...figures('50.000000'),
      byCapability: [cap('review_draft', '50.000000')],
    },
  ],
};
const aiPrevious = {
  ...aiWeeks,
  groupBy: 'capability',
  total: figures('120.000000'),
  items: [],
};
const aiTop = {
  ...aiWeeks,
  groupBy: 'payer',
  payerType: 'workspace',
  payers: 7,
  items: [
    { payerType: 'workspace', payerId: SCHOOL_A, ...figures('90.000000') },
    { payerType: 'workspace', payerId: SCHOOL_B, ...figures('30.000000') },
  ],
  others: { payers: 5, ...figures('30.000000') },
};
const names = {
  total: 1,
  page: 1,
  limit: 2,
  items: [{ id: SCHOOL_A, name: 'Nordic', slug: 'nordic', kind: 'SCHOOL' }],
};
const zero = {
  calls: 0,
  failed: 0,
  fallbackCalls: 0,
  unpricedCalls: 0,
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  audioMs: 0,
  characters: 0,
  credits: '0',
};
const spend = {
  from: '2026-10-12',
  to: '2026-11-10',
  totals: {
    ...zero,
    calls: 120,
    cost: [
      { currency: 'USD', amount: '12.500000' },
      { currency: 'EUR', amount: '1.000000' },
    ],
  },
  models: [],
  daily: [],
};

interface AiAnswers {
  weeks?: object | 'fail';
  previous?: object | 'fail';
  top?: object | 'fail';
  spend?: object | 'fail';
  names?: object | 'fail';
}

const stats = {
  from: '2026-10-12',
  to: '2026-11-10',
  schools: {
    total: 42,
    byStatus: { active: 38, suspended: 3, closed: 1, purged: 0 },
    byKind: { SCHOOL: 30, SOLO: 12 },
    createdInPeriod: 3,
  },
  students: { total: 1280, newInPeriod: 112 },
  teachers: { total: 96, newInPeriod: 7 },
  lifecycle: {
    closingSoon: { total: 0, items: [], truncated: false },
    purgingSoon: { total: 0, items: [], truncated: false },
  },
  seats: {
    used: 90,
    limit: 150,
    schoolsLimited: 3,
    near: { total: 1, items: [], truncated: false },
    over: { total: 0, items: [], truncated: false },
  },
  daily: [
    { date: '2026-11-09', schools: 41, students: 1200, teachers: 95 },
    { date: '2026-11-10', schools: 42, students: 1280, teachers: 96 },
  ],
};

const queue = (endingSoon: object = { grants: [], subscriptions: [], truncated: false }) => ({
  generatedAt: '2026-11-10T08:00:00.000Z',
  horizon: '2026-11-17T08:00:00.000Z',
  withinDays: 7,
  payers: {},
  plans: [],
  endingSoon,
});

describe('DashboardPage', () => {
  let http: HttpTestingController;
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
  });

  afterEach(() => http.verify());

  async function stable(): Promise<void> {
    for (let i = 0; i < 4; i++) {
      await settle();
      TestBed.tick();
    }
  }

  async function next(url: string, groupBy?: string): Promise<TestRequest> {
    let req!: TestRequest;
    await vi.waitFor(async () => {
      await stable();
      const found = http.match(
        (r) => r.url === url && (groupBy === undefined || r.params.get('groupBy') === groupBy),
      );
      expect(found).toHaveLength(1);
      req = found[0];
    });
    return req;
  }

  async function open(
    answers: { stats?: object | 'fail'; queue?: object | 'fail'; ai?: AiAnswers } = {},
    url = '/',
  ): Promise<void> {
    TestBed.inject(SessionStore).start(sessionBody(adminToken({ admin_level: 'support' })));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    el = harness.fixture.nativeElement as HTMLElement;
    await answer(STATS, answers.stats ?? stats);
    await answer(QUEUE, answers.queue ?? queue());
    await answerAi(answers.ai);
  }

  /** The four AI reads of the period, then the names of the top when it has schools. */
  async function answerAi(ai: AiAnswers = {}): Promise<void> {
    await answer(USAGE, ai.weeks ?? aiWeeks, 'week');
    await answer(USAGE, ai.previous ?? aiPrevious, 'capability');
    await answer(SPEND, ai.spend ?? spend);
    const top = ai.top ?? aiTop;
    await answer(USAGE, top, 'payer');
    if (top !== 'fail' && (top as { items: unknown[] }).items.length > 0) {
      await answer(SCHOOLS, ai.names ?? names);
    }
  }

  async function answer(url: string, body: object | 'fail', groupBy?: string): Promise<void> {
    const req = await next(url, groupBy);
    if (body === 'fail') req.flush(null, unavailable);
    else req.flush(body);
    await stable();
  }

  const find = (id: string) => el.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  const text = (id: string) => find(id)?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
  const all = (id: string) => [...el.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`)];

  it('shows the seats KPI and the schools over their limit, ceiling first', async () => {
    await open({
      stats: {
        ...stats,
        seats: {
          ...stats.seats,
          over: {
            total: 2,
            truncated: false,
            items: [
              { schoolId: 's-warn', name: 'Grace', slug: 'grace', used: 103, limit: 100 },
              { schoolId: 's-full', name: 'Full', slug: 'full', used: 7, limit: 5 },
            ],
          },
        },
      },
    });
    expect(text('kpi-seats')).toContain('90 / 150');
    expect(text('kpi-seats-share')).toBe('60 % taken');
    expect(text('kpi-seats-over')).toContain('2');
    const rows = all('queue-seat');
    expect(rows.map((r) => r.getAttribute('data-level'))).toEqual(['full', 'warning']);
    expect(rows[0].textContent).toContain('7 / 5');
    expect(rows[0].querySelector('a')?.getAttribute('href')).toBe('/schools/s-full/plan');
  });

  it('lists closing and purging schools in the queue, soonest first, red when purge is near', async () => {
    const soon = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();
    await open({
      stats: {
        ...stats,
        lifecycle: {
          closingSoon: {
            total: 1,
            truncated: false,
            items: [
              { schoolId: 's-c', name: 'Closing', slug: 'closing', kind: 'SCHOOL', at: soon(3) },
            ],
          },
          purgingSoon: {
            total: 2,
            truncated: false,
            items: [
              { schoolId: 's-p', name: 'Purging', slug: 'purging', kind: 'SCHOOL', at: soon(2) },
              { schoolId: 's-p2', name: 'Late', slug: 'late', kind: 'SOLO', at: soon(-1) },
            ],
          },
        },
      },
    });
    const rows = all('queue-lifecycle');
    expect(rows.map((r) => r.getAttribute('data-kind'))).toEqual(['purging', 'purging', 'closing']);
    expect(rows[0].textContent).toContain('Late');
    expect(rows[0].textContent).toContain('deleted in 0 d');
    expect(rows[1].getAttribute('data-urgent')).toBe('true');
    expect(rows[2].textContent).toContain('closes in 3 d');
    expect(rows[2].querySelector('a')?.getAttribute('href')).toBe('/schools/s-c/danger');
    expect(find('queue-empty')).toBeNull();
  });

  it('keeps the seats KPI quiet when no school has a limit', async () => {
    await open({
      stats: {
        ...stats,
        seats: {
          used: 0,
          limit: 0,
          schoolsLimited: 0,
          near: { total: 0, items: [], truncated: false },
          over: { total: 0, items: [], truncated: false },
        },
      },
    });
    expect(text('kpi-seats')).toContain('No school has a seat limit');
    expect(all('queue-seat')).toHaveLength(0);
  });

  it('shows the key numbers of the default 30 days', async () => {
    await open();
    expect(text('kpi-schools')).toContain('42');
    expect(text('kpi-schools')).toContain('+3 in the period');
    expect(text('kpi-schools')).toContain('Schools 30 · solo 12');
    expect(text('kpi-students')).toContain('1,280');
    expect(text('kpi-students')).toContain('+112 in the period');
    expect(text('kpi-teachers')).toContain('96');
    expect(find('kpis')!.querySelectorAll('[data-testid="sparkline"]')).toHaveLength(3);
  });

  it('asks for the period in the URL and links the counts to the filtered list', async () => {
    await open({}, '/?period=7');
    expect(find('period-7')!.getAttribute('aria-pressed')).toBe('true');
    expect(find('kpi-status-suspended')!.getAttribute('href')).toBe('/schools?status=suspended');
  });

  it('switches the period for the whole page, keeping the queue as it is', async () => {
    await open();
    find('period-90')!.click();
    const req = await next(STATS);
    expect(req.request.params.get('from')).toBeTruthy();
    req.flush(stats);
    await stable();
    // The AI reads follow the period too.
    await answerAi();
    expect(TestBed.inject(Router).url).toBe('/?period=90');
    // afterEach's verify(): the queue was not read again.
  });

  it('lists what ends within a week, soonest first, a school linking to its plan tab', async () => {
    await open({
      queue: queue({
        grants: [
          {
            grantId: 'g1',
            accountType: 'workspace',
            externalId: 'school-1',
            featureKey: 'ai.practice',
            enabled: true,
            startsAt: '2026-11-01T00:00:00Z',
            endsAt: '2026-11-15T00:00:00Z',
          },
        ],
        subscriptions: [
          {
            subscriptionId: 's1',
            accountType: 'user',
            externalId: 'user-1',
            planCode: 'plus',
            planName: 'Plus',
            planVersion: 1,
            status: 'trial',
            periodEnd: '2026-11-12T00:00:00Z',
          },
        ],
        truncated: true,
      }),
    });
    const items = all('queue-item');
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain('Trial ends');
    expect(items[0].querySelector('[data-testid="queue-link"]')).toBeNull();
    expect(items[1].textContent).toContain('Grant ends');
    expect(items[1].querySelector('[data-testid="queue-link"]')!.getAttribute('href')).toBe(
      '/schools/school-1/plan',
    );
    expect(find('queue-truncated')).not.toBeNull();
  });

  it('says all is in order when nothing ends', async () => {
    await open();
    expect(text('queue-empty')).toContain('All in order');
  });

  it('lets one widget fail without the other', async () => {
    await open({ stats: 'fail' });
    expect(text('kpi-failed')).toContain('Could not load the numbers');
    expect(find('queue-empty')).not.toBeNull();

    find('kpi-failed')!.querySelector('button')!.click();
    await answer(STATS, stats);
    expect(find('kpi-failed')).toBeNull();
    expect(text('kpi-schools')).toContain('42');
  });

  it('offers a retry for the queue alone', async () => {
    await open({ queue: 'fail' });
    expect(text('queue-failed')).toContain('Could not load the queue');
    expect(text('kpi-schools')).toContain('42');

    find('queue-failed')!.querySelector('button')!.click();
    await answer(QUEUE, queue());
    expect(find('queue-empty')).not.toBeNull();
  });

  it('shows the growth of the period from the same read, a day per bar', async () => {
    await open({
      stats: { ...stats, schools: { ...stats.schools, createdInPeriod: 0 } },
    });
    // No new school in the period: a sentence, not a flat chart.
    expect(text('growth-schools')).toContain('+0 in the period');
    expect(find('growth-schools')!.querySelector('[data-testid="growth-empty"]')).not.toBeNull();
    expect(text('growth-students')).toContain('+112 in the period');
    expect(find('growth-chart-students')).not.toBeNull();
    expect(find('growth-chart-schools')).toBeNull();
    expect(text('growth-step')).toContain('One bar is a day');
  });

  it('draws a bar per plan, archived muted, each linking to its plan', async () => {
    await open({
      queue: {
        ...queue(),
        plans: [
          {
            code: 'school',
            name: 'School',
            audience: 'workspace',
            status: 'active',
            currentVersion: 2,
            subscribers: 12,
            trial: 2,
            byVersion: [
              { version: 2, count: 9 },
              { version: 1, count: 3 },
            ],
          },
          {
            code: 'old_school',
            name: 'Old school',
            audience: 'workspace',
            status: 'archived',
            currentVersion: 1,
            subscribers: 1,
            trial: 0,
            byVersion: [{ version: 1, count: 1 }],
          },
          {
            code: 'plus',
            name: 'Plus',
            audience: 'individual',
            status: 'active',
            currentVersion: 1,
            subscribers: 4,
            trial: 0,
            byVersion: [{ version: 1, count: 4 }],
          },
        ],
      },
    });
    const bars = all('plan-bar');
    expect(bars.map((b) => b.getAttribute('data-code'))).toEqual(['school', 'old_school', 'plus']);
    expect(bars[0].getAttribute('href')).toBe('/plans/school');
    expect(bars[0].textContent).toContain('3 on older versions');
    expect(bars[0].textContent).toContain('2 on trial');
    expect(bars[1].getAttribute('data-archived')).toBe('true');
    expect(bars[1].classList).toContain('opacity-60');
    expect(text('plans-individual')).toContain('Self-study students');
    expect(
      find('plans-individual')!.querySelector('[data-testid="plan-bar-count"]')!.textContent,
    ).toContain('4');
  });

  it('lets the plans and the growth fail with their own widgets and retry', async () => {
    await open({ stats: 'fail', queue: 'fail' });
    expect(text('growth-failed')).toContain('Could not load the growth');
    expect(text('plans-failed')).toContain('Could not load the plans');

    find('plans-failed')!.querySelector('button')!.click();
    await answer(QUEUE, queue());
    expect(text('plans-empty')).toContain('No plans yet');
    expect(find('growth-failed')).not.toBeNull();

    find('growth-failed')!.querySelector('button')!.click();
    await answer(STATS, stats);
    expect(find('growth-students')).not.toBeNull();
  });

  it('shows credits and money of the period with the change to the previous one', async () => {
    await open();
    expect(text('kpi-ai')).toContain('150');
    expect(text('kpi-ai-change')).toBe('+25 % to the previous period');
    expect(text('kpi-ai-calls')).toBe('120 model calls');
    expect(text('kpi-ai-unpriced')).toContain('2 calls without a price');
    // USD first, another currency beside it, never converted (the language decides the format).
    expect(text('kpi-ai-money')).toMatch(/^Providers billed .*12[.,]50.* \+ .*1[.,]00.*$/);
    expect(text('kpi-ai-money')).toContain('EUR');
    expect(find('kpi-ai')!.querySelector('[data-testid="sparkline"]')).not.toBeNull();
    expect(find('agent-chart')).not.toBeNull();
  });

  it('names the top schools, links them to their AI tab and keeps an unnamed one as its id', async () => {
    await open();
    const rows = all('top-school');
    expect(rows).toHaveLength(2);
    expect(rows[0].querySelector('a')!.getAttribute('href')).toBe(`/schools/${SCHOOL_A}/ai`);
    expect(rows[0].textContent).toContain('Nordic');
    expect(rows[0].textContent).toContain('60 %');
    expect(rows[1].querySelector('[data-testid="top-school-id"]')!.textContent).toContain(SCHOOL_B);
    expect(find('top-schools-all')!.getAttribute('href')).toBe('/ai/spend?payer=workspace');
  });

  it('keeps the top when the names fail, and the credits when the money fails', async () => {
    await open({ ai: { names: 'fail', spend: 'fail', previous: 'fail' } });
    expect(all('top-school')).toHaveLength(2);
    expect(find('top-schools-names-failed')).not.toBeNull();
    expect(text('kpi-ai-money-failed')).toContain("Could not load the providers' bill");
    expect(text('kpi-ai-change')).toBe('Change to the previous period unknown.');
    expect(text('kpi-ai')).toContain('150');

    find('kpi-ai-money-failed')!.querySelector('button')!.click();
    await answer(SPEND, spend);
    expect(text('kpi-ai-money')).toMatch(/12[.,]50/);

    find('top-schools-names-failed')!.querySelector('button')!.click();
    await answer(SCHOOLS, names);
    expect(find('top-schools-names-failed')).toBeNull();
  });

  it('says so when nothing was charged, and lets the credits fail with a retry', async () => {
    await open({
      ai: {
        weeks: 'fail',
        top: { ...aiTop, items: [], others: null, payers: 0 },
      },
    });
    expect(text('kpi-ai-failed')).toContain('Could not load AI credits');
    expect(find('agents-failed')).not.toBeNull();
    expect(text('top-schools-empty')).toContain('No school spent credits');

    find('kpi-ai-failed')!.querySelector('button')!.click();
    await answer(
      USAGE,
      { ...aiWeeks, items: aiWeeks.items.map((w) => ({ ...w, byCapability: [] })) },
      'week',
    );
    expect(text('agents-empty')).toContain('No agent spent credits');
  });

  it('reads both widgets again on refresh', async () => {
    await open();
    find('refresh')!.click();
    await answer(STATS, stats);
    await answer(QUEUE, queue());
    await answerAi();
    expect(find('kpi-schools')).not.toBeNull();
  });
});
