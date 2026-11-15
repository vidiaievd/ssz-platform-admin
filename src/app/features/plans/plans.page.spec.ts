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

  describe('moving subscribers', () => {
    const MIGRATE = `${PLANS}/school/migrate`;

    const previewBody = {
      dryRun: true,
      planCode: 'school',
      toVersion: 2,
      total: 3,
      sources: [
        {
          version: 1,
          subscribers: 3,
          changes: [
            {
              featureKey: 'ai.practice',
              change: 'changed',
              before: { enabled: true, monthlyCredits: '100', limits: {} },
              after: { enabled: true, monthlyCredits: '300', limits: {} },
            },
            {
              featureKey: 'seats.students',
              change: 'changed',
              before: { enabled: true, monthlyCredits: null, limits: { max: 20 } },
              after: { enabled: true, monthlyCredits: null, limits: { max: 10 } },
            },
          ],
        },
      ],
    };

    const batch = (moved: number, remaining: number, skipped = 0) => ({
      dryRun: false,
      planCode: 'school',
      toVersion: 2,
      batchId: 'b-1',
      moved,
      remaining,
      skipped,
    });

    /** The card rereads its counts when a run starts or ends. */
    async function statsReread(): Promise<void> {
      (await next(STATS)).flush(statsBody);
      await stable();
    }

    async function previewShown(): Promise<void> {
      find<HTMLButtonElement>('migration-preview')!.click();
      const req = await next(MIGRATE, 'POST');
      expect(req.request.body).toEqual({ toVersion: 2, dryRun: true });
      req.flush(previewBody);
      await stable();
    }

    async function startRun(reason = 'move to v2'): Promise<void> {
      await previewShown();
      find<HTMLButtonElement>('migration-start')!.click();
      await dialogShown('migration-dialog-text');
      await type('reason-input', reason);
      await confirm();
    }

    it('is offered to super on an active plan with subscribers on older versions', async () => {
      await openCard();
      expect(find('plan-migration')).not.toBeNull();
      expect(textOf(find('plan-migration'))).toContain('Move subscribers to v2');
    });

    it('is not offered to lower levels, nor without older subscribers', async () => {
      await openCard('admin');
      expect(find('plan-migration')).toBeNull();
    });

    it('is not offered when everybody is on the current version', async () => {
      await open('/plans/school');
      (await next(`${PLANS}/school`)).flush(SCHOOL);
      (await next(STATS)).flush({
        ...statsBody,
        plans: [{ ...PLAN_STATS[0], byVersion: [{ version: 2, count: 8 }] }],
      });
      await stable();
      expect(find('plan-migration')).toBeNull();
    });

    it('previews who moves and what changes for them, writing nothing', async () => {
      await openCard();
      await previewShown();

      expect(textOf(find('migration-total'))).toBe('3 subscribers would move to v2.');
      const source = find('migration-source')!;
      expect(source.getAttribute('data-version')).toBe('1');
      expect(textOf(source)).toContain('From v1 — 3 subscribers');
      expect(
        all('version-change', source).map((c) => [
          c.getAttribute('data-key'),
          c.getAttribute('data-change'),
        ]),
      ).toEqual([
        ['ai.practice', 'changed'],
        ['seats.students', 'changed'],
      ]);
      expect(find('migration-fewer-seats', source)).not.toBeNull();
      expect(textOf(find('migration-start'))).toBe('Move 3');
    });

    it('says when the preview finds nobody', async () => {
      await openCard();
      find<HTMLButtonElement>('migration-preview')!.click();
      (await next(MIGRATE, 'POST')).flush({ ...previewBody, total: 0, sources: [] });
      await stable();
      expect(find('migration-nobody')).not.toBeNull();
      expect(find('migration-start')).toBeNull();
    });

    it('runs in batches with one batchId until nobody remains', async () => {
      await openCard();
      await startRun();

      const first = await next(MIGRATE, 'POST');
      expect(first.request.body).toEqual({ toVersion: 2, reason: 'move to v2', dryRun: false });
      first.flush(batch(200, 250));
      await stable();

      const second = await next(MIGRATE, 'POST');
      expect(second.request.body).toEqual({
        toVersion: 2,
        reason: 'move to v2',
        batchId: 'b-1',
        dryRun: false,
      });
      expect(textOf(find('migration-counts'))).toBe('Moved 200 of 450');
      expect(find('migration-progress')!.getAttribute('aria-valuenow')).toBe('44');
      await statsReread();

      second.flush(batch(250, 0));
      await stable();
      expect(find('plan-migration')!.getAttribute('data-phase')).toBe('done');
      expect(textOf(find('migration-phase'))).toBe('Done: 450 subscribers moved.');
      expect(find('migration-progress')!.getAttribute('aria-valuenow')).toBe('100');
      await statsReread();

      find<HTMLButtonElement>('migration-close')!.click();
      await stable();
      await statsReread();
      expect(find('migration-run')).toBeNull();
    });

    it('shows a refused first call inside the dialog', async () => {
      await openCard();
      await startRun();
      (await next(MIGRATE, 'POST')).flush(
        { statusCode: 422, message: 'migration_target_not_current' },
        { status: 422, statusText: 'Unprocessable Entity' },
      );
      await stable();
      expect(inPage('reason-error')).not.toBeNull();
      expect(find('migration-run')).toBeNull();
    });

    it('stops after the batch in flight and continues with the same run', async () => {
      await openCard();
      await startRun();
      (await next(MIGRATE, 'POST')).flush(batch(200, 400));
      await stable();
      await statsReread();

      const inFlight = await next(MIGRATE, 'POST');
      find<HTMLButtonElement>('migration-stop')!.click();
      await stable();
      expect(textOf(find('migration-phase'))).toContain('Stopping after the current batch');
      inFlight.flush(batch(200, 200));
      await stable();
      expect(find('plan-migration')!.getAttribute('data-phase')).toBe('paused');
      expect(textOf(find('migration-counts'))).toBe('Moved 400 of 600');
      expect(http.match((r) => r.url === MIGRATE)).toHaveLength(0);
      await statsReread();

      find<HTMLButtonElement>('migration-resume')!.click();
      const resumed = await next(MIGRATE, 'POST');
      expect(resumed.request.body).toEqual({
        toVersion: 2,
        reason: 'move to v2',
        batchId: 'b-1',
        dryRun: false,
      });
      await statsReread();
      resumed.flush(batch(200, 0));
      await stable();
      expect(textOf(find('migration-phase'))).toBe('Done: 600 subscribers moved.');
      await statsReread();
    });

    it('halts when a batch moves nobody, and on a failed call; both can go on', async () => {
      await openCard();
      await startRun();
      (await next(MIGRATE, 'POST')).flush(batch(200, 300));
      await stable();
      await statsReread();

      (await next(MIGRATE, 'POST')).flush(batch(0, 300, 5));
      await stable();
      expect(find('plan-migration')!.getAttribute('data-phase')).toBe('stalled');
      await statsReread();

      find<HTMLButtonElement>('migration-resume')!.click();
      await statsReread();
      (await next(MIGRATE, 'POST')).flush(
        { statusCode: 503, message: 'Service Unavailable' },
        { status: 503, statusText: 'Service Unavailable' },
      );
      await stable();
      expect(find('plan-migration')!.getAttribute('data-phase')).toBe('failed');
      expect(textOf(find('migration-phase'))).toContain('300 still to move');
      await statsReread();

      // Left as it is: the card goes back to the preview.
      find<HTMLButtonElement>('migration-leave')!.click();
      await stable();
      await statsReread();
      expect(find('migration-run')).toBeNull();
      expect(find('migration-preview')).not.toBeNull();
    });

    it('keeps a stopped run when the card is left and opened again', async () => {
      await openCard();
      await startRun();
      (await next(MIGRATE, 'POST')).flush(batch(200, 400));
      await stable();
      await statsReread();
      const inFlight = await next(MIGRATE, 'POST');
      find<HTMLButtonElement>('migration-stop')!.click();
      await stable();
      inFlight.flush(batch(200, 200));
      await stable();
      await statsReread();

      await TestBed.inject(Router).navigateByUrl('/plans');
      (await next(PLANS)).flush(PLAN_LIST);
      (await next(STATS)).flush(statsBody);
      await stable();

      await TestBed.inject(Router).navigateByUrl('/plans/school');
      (await next(`${PLANS}/school`)).flush(SCHOOL);
      (await next(STATS)).flush(statsBody);
      await stable();
      expect(find('plan-migration')!.getAttribute('data-phase')).toBe('paused');
      expect(textOf(find('migration-counts'))).toBe('Moved 400 of 600');
      expect(find('migration-resume')).not.toBeNull();
    });
  });

  /** A key's row of the editor. */
  const editorRow = (key: string) =>
    el.querySelector<HTMLElement>(`[data-testid="editor-row"][data-key="${key}"]`)!;

  async function setState(key: string, label: 'Not in plan' | 'Off' | 'On'): Promise<void> {
    [
      ...find('editor-state', editorRow(key))!.querySelectorAll<HTMLElement>(
        'button, .p-togglebutton',
      ),
    ]
      .find((b) => b.textContent!.trim() === label)!
      .click();
    await stable();
  }

  async function typeIn(root: HTMLElement, testId: string, value: string): Promise<void> {
    const field = find<HTMLInputElement>(testId, root)!;
    field.value = value;
    field.dispatchEvent(new Event('input'));
    await stable();
  }

  async function tick(root: HTMLElement, testId: string): Promise<void> {
    find(testId, root)!.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();
    await stable();
  }

  async function openEditor(body: PlanDetailsResponseDto = SCHOOL): Promise<void> {
    await open(`/plans/${body.code}/new-version`);
    (await next(`${PLANS}/${body.code}`)).flush(body);
    await stable();
  }

  /** The card the page lands on after a save. */
  async function landOnCard(body: PlanDetailsResponseDto): Promise<void> {
    (await next(`${PLANS}/${body.code}`)).flush(body);
    (await next(STATS)).flush(statsBody);
    await stable();
    expect(TestBed.inject(Router).url).toBe(`/plans/${body.code}`);
  }

  describe('writing plans', () => {
    it('offers a new version of an active plan to super', async () => {
      await openCard();
      expect(find('plan-new-version')?.getAttribute('href')).toBe('/plans/school/new-version');
    });

    it('offers no new version of an archived plan', async () => {
      await openCard('super', { ...SCHOOL, status: 'archived' });
      expect(find('plan-new-version')).toBeNull();
    });

    it('offers no new version to lower levels', async () => {
      await openCard('admin');
      expect(find('plan-new-version')).toBeNull();
    });

    it('offers no new plan in the catalog to lower levels', async () => {
      await open('/plans', 'admin');
      (await next(PLANS)).flush(PLAN_LIST);
      (await next(STATS)).flush(statsBody);
      await stable();
      expect(find('plans-new')).toBeNull();
    });

    it('keeps the editor away from lower levels', async () => {
      await open('/plans/school/new-version', 'admin');
      await stable();
      expect(find('plan-version-page')).toBeNull();
      expect(http.match((r) => r.url.startsWith(PLANS))).toHaveLength(0);
    });
  });

  describe('new version', () => {
    it('starts from the current keys, checks the fields and sends the full list', async () => {
      await openEditor();
      expect(textOf(find('page-title'))).toBe('School — new version v3');
      expect(editorRow('ai.practice').dataset['state']).toBe('on');
      expect(find<HTMLInputElement>('editor-credits', editorRow('ai.practice'))!.value).toBe('300');
      expect(editorRow('ai.authoring').dataset['state']).toBe('absent');
      // Nothing changed yet: nothing to save.
      expect(find('version-no-changes')).not.toBeNull();
      expect(find<HTMLButtonElement>('version-save')!.disabled).toBe(true);

      await typeIn(editorRow('ai.practice'), 'editor-credits', '500');
      await setState('ai.authoring', 'On');
      // An empty allowance is an error only after a save was tried.
      expect(find('editor-credits-error', editorRow('ai.authoring'))).toBeNull();
      find<HTMLButtonElement>('version-save')!.click();
      await stable();
      expect(textOf(find('editor-credits-error', editorRow('ai.authoring')))).toBe(
        'Give the credits or tick “unmetered”.',
      );
      expect(inPage('reason-dialog')).toBeNull();

      await tick(editorRow('ai.authoring'), 'editor-unmetered');
      await setState('ai.review_draft', 'Not in plan');
      expect(all('version-change').map((c) => [c.dataset['key'], c.dataset['change']])).toEqual([
        ['ai.authoring', 'added'],
        ['ai.practice', 'changed'],
        ['ai.review_draft', 'removed'],
      ]);

      find<HTMLButtonElement>('version-save')!.click();
      await dialogShown('version-reach');
      await type('reason-input', 'more practice');
      await confirm();
      const req = await next(`${PLANS}/school/versions`, 'POST');
      expect(req.request.body).toEqual({
        expectedVersion: 2,
        reason: 'more practice',
        features: [
          { featureKey: 'ai.authoring', enabled: true, monthlyCredits: null, limits: {} },
          { featureKey: 'ai.practice', enabled: true, monthlyCredits: '500', limits: {} },
          {
            featureKey: 'seats.students',
            enabled: true,
            monthlyCredits: null,
            limits: { max: 20 },
          },
        ],
      });
      req.flush(PLAN_LIST[0]);
      await landOnCard(SCHOOL);
    });

    it('asks for the seat limit while seats are on', async () => {
      await openEditor();
      await typeIn(editorRow('seats.students'), 'editor-limit', '');
      find<HTMLButtonElement>('version-save')!.click();
      await stable();
      expect(textOf(find('editor-limit-error', editorRow('seats.students')))).toBe(
        'This field is required.',
      );
      await typeIn(editorRow('seats.students'), 'editor-limit', '2.5');
      expect(textOf(find('editor-limit-error', editorRow('seats.students')))).toBe(
        'A whole number, 0 or more.',
      );
      expect(inPage('reason-dialog')).toBeNull();
    });

    it('on a 409 rereads the plan and keeps what was typed', async () => {
      await openEditor();
      await typeIn(editorRow('ai.practice'), 'editor-credits', '500');
      find<HTMLButtonElement>('version-save')!.click();
      await dialogShown('version-reach');
      await type('reason-input', 'more');
      await confirm();
      (await next(`${PLANS}/school/versions`, 'POST')).flush(
        { statusCode: 409, message: 'Plan "school" changed since version 2; reload and retry' },
        { status: 409, statusText: 'Conflict' },
      );
      await stable();
      expect(textOf(inPage('reason-error'))).toContain('The plan got a new version meanwhile');
      inPage<HTMLButtonElement>('reason-cancel')!.click();
      await stable();

      find<HTMLButtonElement>('version-reread')!.click();
      const v3 = v(3, [
        { featureKey: 'ai.practice', enabled: true, monthlyCredits: '400', limits: {} },
      ]);
      (await next(`${PLANS}/school`)).flush({
        ...SCHOOL,
        current: v3,
        versions: [v3, SCHOOL_V2, SCHOOL_V1],
      });
      await stable();

      expect(find('version-conflict')).toBeNull();
      expect(textOf(find('page-title'))).toBe('School — new version v4');
      expect(find<HTMLInputElement>('editor-credits', editorRow('ai.practice'))!.value).toBe('500');
      // Counted against v3 now: seats are added back, credits 400 → 500.
      expect(all('version-change').map((c) => [c.dataset['key'], c.dataset['change']])).toEqual([
        ['ai.practice', 'changed'],
        ['ai.review_draft', 'added'],
        ['seats.students', 'added'],
      ]);

      find<HTMLButtonElement>('version-save')!.click();
      await dialogShown('version-reach');
      await type('reason-input', 'more');
      await confirm();
      const req = await next(`${PLANS}/school/versions`, 'POST');
      expect(req.request.body.expectedVersion).toBe(3);
      req.flush(PLAN_LIST[0]);
      await landOnCard(SCHOOL);
    });

    it('shows the server’s refusal with its code and details', async () => {
      await openEditor();
      await typeIn(editorRow('ai.practice'), 'editor-credits', '500');
      find<HTMLButtonElement>('version-save')!.click();
      await dialogShown('version-reach');
      await type('reason-input', 'more');
      await confirm();
      (await next(`${PLANS}/school/versions`, 'POST')).flush(
        {
          statusCode: 422,
          code: 'limit_required',
          message: 'Feature key "seats.students" needs the limit "max" while it is on',
          details: { code: 'limit_required', featureKey: 'seats.students', limit: 'max' },
        },
        { status: 422, statusText: 'Unprocessable Entity' },
      );
      await stable();
      expect(textOf(inPage('reason-error-code'))).toBe('limit_required');
      expect(
        [...inPage('reason-error-details')!.querySelectorAll('li')].map((li) => textOf(li)),
      ).toEqual(['featureKey: seats.students', 'limit: max']);
    });

    it('writes no version of an archived plan', async () => {
      await openEditor({ ...SCHOOL, status: 'archived' });
      expect(find('plan-archived-note')).not.toBeNull();
      expect(find('features-editor')).toBeNull();
    });
  });

  describe('new plan', () => {
    it('checks code, name and keys, then creates the plan', async () => {
      await open('/plans/new');
      await stable();
      expect(editorRow('seats.students')).not.toBeNull();

      find<HTMLButtonElement>('plan-create')!.click();
      await stable();
      expect(textOf(find('plan-code-error'))).toBe('This field is required.');
      expect(find('plan-name-error')).not.toBeNull();
      expect(inPage('reason-dialog')).toBeNull();

      await typeIn(el, 'plan-code-input', 'School-Plus');
      expect(textOf(find('plan-code-error'))).toContain('lower_snake_case');
      await typeIn(el, 'plan-code-input', 'school_plus');
      expect(find('plan-code-error')).toBeNull();
      await typeIn(el, 'plan-new-name', ' School Plus ');

      // Self-study plans take no seats: the row goes.
      [...find('plan-audience-input')!.querySelectorAll<HTMLElement>('button, .p-togglebutton')]
        .find((b) => b.textContent!.trim() === 'Self-study students')!
        .click();
      await stable();
      expect(editorRow('seats.students')).toBeNull();

      await setState('ai.practice', 'On');
      await typeIn(editorRow('ai.practice'), 'editor-credits', '100');

      find<HTMLButtonElement>('plan-create')!.click();
      await dialogShown('create-summary');
      expect(textOf(inPage('create-summary'))).toBe(
        'School Plus · school_plus · Self-study students',
      );
      await type('reason-input', 'new tier');
      await confirm();
      let req = await next(PLANS, 'POST');
      expect(req.request.body).toEqual({
        code: 'school_plus',
        name: 'School Plus',
        audience: 'individual',
        reason: 'new tier',
        features: [{ featureKey: 'ai.practice', enabled: true, monthlyCredits: '100', limits: {} }],
      });

      // A taken code: said in the dialog and on the field.
      req.flush(
        { statusCode: 409, message: 'Plan "school_plus" already exists' },
        { status: 409, statusText: 'Conflict' },
      );
      await stable();
      expect(textOf(inPage('reason-error'))).toContain('A plan with this code already exists.');
      inPage<HTMLButtonElement>('reason-cancel')!.click();
      await stable();
      expect(textOf(find('plan-code-error'))).toBe('A plan with this code already exists.');
      find<HTMLButtonElement>('plan-create')!.click();
      await stable();
      expect(inPage('reason-dialog')).toBeNull();

      await typeIn(el, 'plan-code-input', 'self_plus');
      find<HTMLButtonElement>('plan-create')!.click();
      await dialogShown('create-summary');
      await type('reason-input', 'new tier');
      await confirm();
      req = await next(PLANS, 'POST');
      expect(req.request.body.code).toBe('self_plus');
      const created: PlanResponseDto = {
        id: 'p9',
        code: 'self_plus',
        name: 'School Plus',
        audience: 'individual',
        status: 'active',
        current: v(1, req.request.body.features, '6f1c2a90-0000-4000-8000-000000000001'),
      };
      req.flush(created);
      await landOnCard({ ...created, versions: [created.current] });
    });

    it('is reached from the catalog by super only', async () => {
      await open('/plans');
      (await next(PLANS)).flush(PLAN_LIST);
      (await next(STATS)).flush(statsBody);
      await stable();
      expect(find('plans-new')).not.toBeNull();
    });
  });
});
