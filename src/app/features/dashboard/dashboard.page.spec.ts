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
const unavailable = { status: 503, statusText: 'Unavailable' };

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

  async function open(
    answers: { stats?: object | 'fail'; queue?: object | 'fail' } = {},
    url = '/',
  ): Promise<void> {
    TestBed.inject(SessionStore).start(sessionBody(adminToken({ admin_level: 'support' })));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    el = harness.fixture.nativeElement as HTMLElement;
    await answer(STATS, answers.stats ?? stats);
    await answer(QUEUE, answers.queue ?? queue());
  }

  async function answer(url: string, body: object | 'fail'): Promise<void> {
    const req = await next(url);
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
    expect(el.querySelectorAll('[data-testid="sparkline"]')).toHaveLength(3);
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

  it('reads both widgets again on refresh', async () => {
    await open();
    find('refresh')!.click();
    await answer(STATS, stats);
    await answer(QUEUE, queue());
    expect(find('kpi-schools')).not.toBeNull();
  });
});
