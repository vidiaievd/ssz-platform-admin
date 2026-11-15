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
import { PlanDetailsResponseDto } from '../../api/subscription/models/plan-details-response-dto';
import { PlanResponseDto } from '../../api/subscription/models/plan-response-dto';
import { PlanStatsDto } from '../../api/subscription/models/plan-stats-dto';
import { AdminLevel } from '../../core/auth/admin-level';
import { provideApiClients } from '../../core/api/provide-api-clients';
import { SessionStore } from '../../core/auth/session.store';
import { adminToken, sessionBody, settle } from '../../core/auth/testing';
import { APP_CONFIG } from '../../core/config/app-config';
// Real English texts, so a missing key would show up as the key itself.
import en from '../../../../public/i18n/en.json';

const PLANS = 'http://gw/api/v1/admin/subscriptions/plans';
const STATS = 'http://gw/api/v1/admin/subscriptions/stats';
const at = '2026-10-01T00:00:00Z';

const v = (
  version: number,
  features: PlanDetailsResponseDto['versions'][number]['features'],
  createdBy = 'seed',
) => ({
  version,
  createdAt: at,
  createdBy,
  features,
});

const SCHOOL_V1 = v(1, [
  { featureKey: 'ai.practice', enabled: true, monthlyCredits: '100', limits: {} },
  { featureKey: 'seats.students', enabled: true, monthlyCredits: null, limits: { max: 20 } },
]);
const SCHOOL_V2 = v(
  2,
  [
    { featureKey: 'ai.practice', enabled: true, monthlyCredits: '300', limits: {} },
    { featureKey: 'ai.review_draft', enabled: true, monthlyCredits: '50', limits: {} },
    { featureKey: 'seats.students', enabled: true, monthlyCredits: null, limits: { max: 20 } },
  ],
  '6f1c2a90-0000-4000-8000-000000000001',
);

const PLAN_LIST: PlanResponseDto[] = [
  {
    id: 'p1',
    code: 'school',
    name: 'School',
    audience: 'workspace',
    status: 'active',
    current: SCHOOL_V2,
  },
  {
    id: 'p0',
    code: 'free_workspace',
    name: 'Free',
    audience: 'workspace',
    status: 'active',
    current: v(1, []),
  },
  {
    id: 'p2',
    code: 'legacy',
    name: 'Legacy',
    audience: 'workspace',
    status: 'archived',
    current: v(1, []),
  },
  {
    id: 'p3',
    code: 'free_individual',
    name: 'Free',
    audience: 'individual',
    status: 'active',
    current: v(1, []),
  },
];

const SCHOOL: PlanDetailsResponseDto = { ...PLAN_LIST[0], versions: [SCHOOL_V2, SCHOOL_V1] };

const PLAN_STATS: PlanStatsDto[] = [
  {
    code: 'school',
    name: 'School',
    audience: 'workspace',
    status: 'active',
    currentVersion: 2,
    byVersion: [
      { version: 2, count: 5 },
      { version: 1, count: 3 },
    ],
    subscribers: 8,
    trial: 1,
  },
];

const statsBody = {
  generatedAt: at,
  horizon: at,
  withinDays: 14,
  endingSoon: { subscriptions: [], grants: [] },
  payers: {},
  plans: PLAN_STATS,
};

describe('Plans section', () => {
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

  async function open(url: string, level: AdminLevel = 'super'): Promise<void> {
    TestBed.inject(SessionStore).start(sessionBody(adminToken({ admin_level: level })));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    el = harness.fixture.nativeElement as HTMLElement;
  }

  async function openCard(
    level: AdminLevel = 'super',
    body: PlanDetailsResponseDto = SCHOOL,
  ): Promise<void> {
    await open(`/plans/${body.code}`, level);
    (await next(`${PLANS}/${body.code}`)).flush(body);
    (await next(STATS)).flush(statsBody);
    await stable();
  }

  const find = <T extends HTMLElement = HTMLElement>(testId: string, root: ParentNode = el) =>
    root.querySelector<T>(`[data-testid="${testId}"]`);
  const all = (testId: string, root: ParentNode = el) => [
    ...root.querySelectorAll<HTMLElement>(`[data-testid="${testId}"]`),
  ];
  const inPage = <T extends HTMLElement = HTMLElement>(testId: string) =>
    find<T>(testId, document.body);
  const textOf = (node: Element | null) => node?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
  const row = (code: string) =>
    el.querySelector<HTMLElement>(`[data-testid="plan-row"][data-code="${code}"]`)!;
  const version = (n: number) =>
    el.querySelector<HTMLElement>(`[data-testid="plan-version"][data-version="${n}"]`)!;

  async function dialogShown(testId: string): Promise<void> {
    await vi.waitFor(async () => {
      await stable();
      expect(inPage(testId)?.isConnected).toBe(true);
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

  describe('catalog', () => {
    it('lists plans by audience with versions, keys and subscribers', async () => {
      await open('/plans');
      (await next(PLANS)).flush(PLAN_LIST);
      (await next(STATS)).flush(statsBody);
      await stable();

      expect(textOf(find('page-title'))).toBe('Plans');
      const codes = all('plan-row', find('plans-workspace')!).map((r) =>
        r.getAttribute('data-code'),
      );
      expect(codes).toEqual(['free_workspace', 'school', 'legacy']);
      expect(all('plan-row', find('plans-individual')!)).toHaveLength(1);

      expect(textOf(find('plan-version', row('school')))).toBe('v2');
      expect(textOf(find('plan-keys', row('school')))).toBe('3');
      expect(textOf(find('plan-subscribers', row('school')))).toContain('8');
      expect(textOf(find('plan-older', row('school')))).toBe('3 on older versions');
      expect(textOf(find('plan-subscribers', row('free_workspace')))).toBe('0');
      expect(find('plan-free', row('free_workspace'))).not.toBeNull();
      expect(row('legacy').getAttribute('data-archived')).toBe('true');
      expect(find('plan-archived', row('legacy'))).not.toBeNull();
      expect(find('plan-link', row('school'))!.getAttribute('href')).toBe('/plans/school');
    });

    it('keeps the catalog when the subscriber counts fail', async () => {
      await open('/plans');
      (await next(PLANS)).flush(PLAN_LIST);
      (await next(STATS)).flush(null, { status: 503, statusText: 'Unavailable' });
      await stable();

      expect(find('plans-stats-failed')).not.toBeNull();
      expect(textOf(find('plan-subscribers', row('school')))).toBe('—');
      expect(textOf(find('plan-version', row('school')))).toBe('v2');

      find('plans-stats-failed')!.querySelector('button')!.click();
      (await next(STATS)).flush(statsBody);
      await stable();
      expect(find('plans-stats-failed')).toBeNull();
      expect(textOf(find('plan-subscribers', row('school')))).toContain('8');
    });

    it('offers a retry when the catalog fails', async () => {
      await open('/plans');
      (await next(PLANS)).flush(null, { status: 500, statusText: 'Error' });
      (await next(STATS)).flush(statsBody);
      await stable();
      expect(find('plans-failed')).not.toBeNull();
    });
  });

  describe('card', () => {
    it('shows every version with its subscribers, keys and the change from the one below', async () => {
      await openCard();

      expect(textOf(find('page-title'))).toBe('School');
      expect(textOf(find('plan-current'))).toBe('New subscriptions get v2');
      expect(textOf(find('plan-subscribers'))).toContain('8 subscribers');
      expect(textOf(find('plan-older'))).toBe('3 on older versions');

      expect(all('plan-version').map((x) => x.getAttribute('data-version'))).toEqual(['2', '1']);
      expect(find('version-current', version(2))).not.toBeNull();
      expect(find('version-current', version(1))).toBeNull();
      expect(textOf(find('version-subscribers', version(2)))).toBe('5 subscribers');
      expect(textOf(find('version-subscribers', version(1)))).toBe('3 subscribers');
      expect(textOf(find('version-created', version(1)))).toContain('seed');
      expect(textOf(find('version-created', version(2)))).toContain('6f1c2a90');

      const keys = all('version-key', version(2)).map((r) => r.getAttribute('data-key'));
      expect(keys).toEqual(['ai.practice', 'ai.review_draft', 'seats.students']);
      expect(textOf(find('plan-terms', all('version-key', version(2))[0]))).toBe(
        '300 credits / month',
      );
      expect(textOf(find('plan-terms', all('version-key', version(2))[2]))).toBe('up to 20 seats');

      const changes = all('version-change', version(2)).map((c) => [
        c.getAttribute('data-key'),
        c.getAttribute('data-change'),
      ]);
      expect(changes).toEqual([
        ['ai.practice', 'changed'],
        ['ai.review_draft', 'added'],
      ]);
      expect(textOf(all('version-change', version(2))[0])).toContain('100 credits / month');
      expect(textOf(all('version-change', version(2))[0])).toContain('300 credits / month');
      // The first version has nothing below it.
      expect(find('version-changes', version(1))).toBeNull();
    });

    it('lets lower levels read but not change', async () => {
      await openCard('admin');
      expect(find('plan-versions')).not.toBeNull();
      expect(find('plan-rename')).toBeNull();
      expect(find('plan-archive')).toBeNull();
    });

    it('renames with a reason and keeps the versions', async () => {
      await openCard();
      find<HTMLButtonElement>('plan-rename')!.click();
      await dialogShown('plan-name');
      expect(inPage<HTMLInputElement>('plan-name')!.value).toBe('School');

      // The same name cannot be sent.
      await type('reason-input', 'marketing');
      await confirm();
      expect(inPage('plan-name-unchanged')).not.toBeNull();
      expect(http.match((r) => r.method === 'PATCH')).toHaveLength(0);

      await type('plan-name', '  School Plus ');
      await confirm();
      const req = await next(`${PLANS}/school`, 'PATCH');
      expect(req.request.body).toEqual({ name: 'School Plus', reason: 'marketing' });
      req.flush({ ...PLAN_LIST[0], name: 'School Plus' });
      await stable();

      expect(textOf(find('page-title'))).toBe('School Plus');
      expect(all('plan-version')).toHaveLength(2);
    });

    it('archives with a reason; the archive button goes away', async () => {
      await openCard();
      find<HTMLButtonElement>('plan-archive')!.click();
      await dialogShown('archive-text');
      expect(textOf(inPage('archive-subscribers'))).toContain('8 subscribers');

      await type('reason-input', 'retired tier');
      await confirm();
      const req = await next(`${PLANS}/school/archive`, 'POST');
      expect(req.request.body).toEqual({ reason: 'retired tier' });
      req.flush({ ...PLAN_LIST[0], status: 'archived' });
      await stable();

      expect(textOf(find('plan-status'))).toBe('Archived');
      expect(find('plan-archived-note')).not.toBeNull();
      expect(find('plan-archive')).toBeNull();
      expect(find('plan-rename')).not.toBeNull();
    });

    it('shows a refused archive inside the dialog', async () => {
      await openCard();
      find<HTMLButtonElement>('plan-archive')!.click();
      await dialogShown('archive-text');
      await type('reason-input', 'retired');
      await confirm();
      (await next(`${PLANS}/school/archive`, 'POST')).flush(
        { statusCode: 409, message: 'Plan "school" changed meanwhile; reload and retry' },
        { status: 409, statusText: 'Conflict' },
      );
      await stable();
      expect(inPage('reason-error')).not.toBeNull();
      expect(textOf(find('plan-status'))).toBe('Active');
    });

    it('never offers to archive a free plan', async () => {
      await openCard('super', {
        ...PLAN_LIST[1],
        versions: [PLAN_LIST[1].current],
      });
      expect(find('plan-free')).not.toBeNull();
      expect(find('plan-free-note')).not.toBeNull();
      expect(find('plan-archive')).toBeNull();
      expect(find('plan-rename')).not.toBeNull();
      expect(find('version-no-keys')).not.toBeNull();
    });

    it('says so for an unknown code', async () => {
      await open('/plans/nope');
      (await next(`${PLANS}/nope`)).flush(
        { statusCode: 404, message: 'Not Found' },
        { status: 404, statusText: 'Not Found' },
      );
      (await next(STATS)).flush(statsBody);
      await stable();
      expect(find('plan-not-found')).not.toBeNull();
      expect(TestBed.inject(Router).url).toBe('/plans/nope');
    });
  });
});
