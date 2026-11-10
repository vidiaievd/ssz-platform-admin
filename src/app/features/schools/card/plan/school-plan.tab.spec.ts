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
import { AccountLookupItemDto } from '../../../../api/subscription/models/account-lookup-item-dto';
import { AdminSchoolDetailDto } from '../../../../api/organization/models/admin-school-detail-dto';
import { GrantResponseDto } from '../../../../api/subscription/models/grant-response-dto';
import { PlanResponseDto } from '../../../../api/subscription/models/plan-response-dto';
import { SubscriptionResponseDto } from '../../../../api/subscription/models/subscription-response-dto';
import { routes } from '../../../../app.routes';
import { AdminLevel } from '../../../../core/auth/admin-level';
import { provideApiClients } from '../../../../core/api/provide-api-clients';
import { SessionStore } from '../../../../core/auth/session.store';
import { adminToken, sessionBody, settle } from '../../../../core/auth/testing';
import { APP_CONFIG } from '../../../../core/config/app-config';
// Real English texts, so a missing key would show up as the key itself.
import en from '../../../../../../public/i18n/en.json';

const ID = '7d3c1b2a-0000-4000-8000-000000000001';
const SCHOOL = `http://gw/api/v1/admin/schools/${ID}`;
const LOOKUP = 'http://gw/api/v1/admin/subscriptions/accounts/lookup';
const ACCOUNT = `http://gw/api/v1/admin/subscriptions/accounts/workspace/${ID}`;
const HISTORY = `${ACCOUNT}/history`;
const PLANS = 'http://gw/api/v1/admin/subscriptions/plans';

/** A UTC day `days` from today, as a date input gives it. */
const day = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

const school = {
  id: ID,
  name: 'Nordick',
  slug: 'nordick',
  kind: 'SCHOOL',
  type: 'ONLINE',
  status: 'active',
  description: null,
  avatarUrl: null,
  createdAt: '2026-03-05T10:00:00.000Z',
  updatedAt: '2026-03-05T10:00:00.000Z',
  deletedAt: null,
  contacts: { email: null, website: null, city: null },
  owner: { userId: 'owner-1', name: 'Kari Nordmann', email: 'kari@nordick.no' },
  counts: {
    students: 0,
    archivedStudents: 0,
    teachers: 0,
    staff: 0,
    pendingApplications: 0,
    pendingInvitations: 0,
  },
  groups: [],
  courses: { count: 0, ids: [] },
  seats: { used: 7, limit: 100, ceiling: 110, state: 'ok' },
} satisfies AdminSchoolDetailDto;

function subscription(overrides: Partial<SubscriptionResponseDto> = {}): SubscriptionResponseDto {
  return {
    id: 'sub-2',
    planCode: 'school_pro',
    planName: 'School Pro',
    planVersion: 2,
    status: 'active',
    periodStart: '2026-09-01T00:00:00.000Z',
    periodEnd: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    createdBy: 'admin-1',
    endedAt: null,
    endedBy: null,
    ...overrides,
  };
}

function grant(overrides: Partial<GrantResponseDto> = {}): GrantResponseDto {
  return {
    id: 'g-1',
    featureKey: 'ai.practice',
    enabled: true,
    monthlyCredits: '500',
    limits: {},
    startsAt: '2026-11-01T00:00:00.000Z',
    endsAt: '2026-12-15T00:00:00.000Z',
    state: 'active',
    reason: 'Pilot of the rehearsal',
    createdAt: '2026-11-01T00:00:00.000Z',
    createdBy: 'admin-1',
    revokedAt: null,
    revokedBy: null,
    ...overrides,
  };
}

function lookup(overrides: Partial<AccountLookupItemDto> = {}): AccountLookupItemDto {
  return {
    externalId: ID,
    hasAccount: true,
    source: 'subscription',
    plan: { code: 'school_pro', name: 'School Pro', version: 2 },
    subscription: {
      id: 'sub-2',
      status: 'active',
      periodStart: '2026-09-01T00:00:00.000Z',
      periodEnd: null,
    },
    activeGrants: 1,
    scheduledGrants: 0,
    seats: null,
    ...overrides,
  };
}

const version = (v: number, features: PlanResponseDto['current']['features'] = []) => ({
  version: v,
  createdAt: '2026-01-01T00:00:00.000Z',
  createdBy: 'seed',
  features,
});

function plan(code: string, overrides: Partial<PlanResponseDto> = {}): PlanResponseDto {
  return {
    id: `p-${code}`,
    code,
    name: code,
    audience: 'workspace',
    status: 'active',
    current: version(1),
    ...overrides,
  };
}

const PLAN_LIST: PlanResponseDto[] = [
  plan('school_pro', { name: 'School Pro', current: version(3) }),
  plan('free_workspace', { name: 'Free' }),
  plan('old_school', { status: 'archived' }),
  plan('self_study', { audience: 'individual' }),
];

const proDetails = {
  ...PLAN_LIST[0],
  versions: [
    version(3),
    version(2, [
      { featureKey: 'ai.review_draft', enabled: true, monthlyCredits: '1000', limits: {} },
      { featureKey: 'ai.practice', enabled: true, monthlyCredits: null, limits: {} },
      { featureKey: 'school.review_ai_policy', enabled: false, monthlyCredits: null, limits: {} },
    ]),
  ],
};

describe('SchoolPlanTab', () => {
  let http: HttpTestingController;
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

  /** Not `whenStable()`: in a zoneless app it also waits for unanswered HTTP requests. */
  async function stable(): Promise<void> {
    for (let i = 0; i < 4; i++) {
      await settle();
      TestBed.tick();
    }
  }

  /** The one pending request to `url`, once it has been sent. */
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

  interface Answers {
    lookup?: AccountLookupItemDto;
    account?: unknown;
    history?: unknown;
    details?: unknown;
  }

  /** Opens the tab and answers every read; `null` answers 404. */
  async function open(level: AdminLevel = 'admin', answers: Answers = {}): Promise<void> {
    TestBed.inject(SessionStore).start(sessionBody(adminToken({ admin_level: level })));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(`/schools/${ID}/plan`);
    el = harness.fixture.nativeElement as HTMLElement;
    await stable();
    http.expectOne(SCHOOL).flush(school);
    http.expectOne(LOOKUP).flush({ items: [answers.lookup ?? lookup()] });
    await answerReads(answers);
  }

  const notFound = { status: 404, statusText: 'Not Found' };

  async function answerReads(answers: Answers, withPlans = true): Promise<void> {
    const account = await next(ACCOUNT);
    if (answers.account === null) account.flush({ statusCode: 404 }, notFound);
    else
      account.flush(
        answers.account ?? {
          account: { id: 'a-1', type: 'workspace', externalId: ID, createdAt: '2026-01-01' },
          subscription: subscription(),
          grants: [
            grant(),
            grant({
              id: 'g-2',
              featureKey: 'ai.authoring',
              enabled: false,
              monthlyCredits: null,
              state: 'scheduled',
            }),
          ],
        },
      );
    const history = await next(HISTORY);
    if (answers.history === null) history.flush({ statusCode: 404 }, notFound);
    else
      history.flush(
        answers.history ?? {
          account: { id: 'a-1', type: 'workspace', externalId: ID, createdAt: '2026-01-01' },
          subscriptions: [
            subscription(),
            subscription({
              id: 'sub-1',
              planName: 'Free',
              planVersion: 1,
              status: 'canceled',
              endedAt: '2026-09-01T00:00:00.000Z',
            }),
          ],
          grants: [
            grant(),
            grant({ id: 'g-0', state: 'revoked', revokedAt: '2026-10-02T00:00:00.000Z' }),
          ],
        },
      );
    // The catalog is read once per tab; the plan's versions again only when its code changes.
    if (withPlans) {
      (await next(PLANS)).flush(PLAN_LIST);
      const code = (answers.lookup ?? lookup()).plan?.code;
      if (code) (await next(`${PLANS}/${code}`)).flush(answers.details ?? proDetails);
    }
    await stable();
  }

  const find = <T extends HTMLElement = HTMLElement>(testId: string, root: ParentNode = el) =>
    root.querySelector<T>(`[data-testid="${testId}"]`);
  // Dialogs render into the page, not into the tab.
  const inPage = <T extends HTMLElement = HTMLElement>(testId: string) =>
    find<T>(testId, document.body);
  const text = (testId: string, root: ParentNode = el) =>
    find(testId, root)?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
  const cells = (rowTestId: string, root: ParentNode = el) =>
    [...root.querySelectorAll(`[data-testid="${rowTestId}"]`)].map((row) =>
      [...row.children].map((td) => td.textContent!.replace(/\s+/g, ' ').trim()),
    );

  async function click(testId: string, root: ParentNode = el): Promise<void> {
    find<HTMLButtonElement>(testId, root)!.click();
    await stable();
  }

  /** Waits until the reason dialog has reached the page. */
  async function dialogShown(): Promise<void> {
    await vi.waitFor(async () => {
      await stable();
      expect(inPage('reason-input')?.isConnected).toBe(true);
    });
  }

  async function type(testId: string, value: string): Promise<void> {
    const field = inPage<HTMLInputElement>(testId)!;
    field.value = value;
    field.dispatchEvent(new Event('input'));
    await stable();
  }

  /** Opens a p-select overlay and picks the option with this text. */
  async function pick(testId: string, option: string): Promise<void> {
    inPage(testId)!.click();
    await stable();
    let choice!: HTMLElement;
    await vi.waitFor(async () => {
      await stable();
      choice = [...document.body.querySelectorAll<HTMLElement>('[role="option"]')].find((o) =>
        o.textContent!.includes(option),
      )!;
      expect(choice).toBeTruthy();
    });
    choice.click();
    await stable();
  }

  async function chooseButton(testId: string, label: string): Promise<void> {
    [...inPage(testId)!.querySelectorAll<HTMLElement>('button, [role="radio"], .p-togglebutton')]
      .find((b) => b.textContent!.trim() === label)!
      .click();
    await stable();
  }

  async function confirm(): Promise<void> {
    inPage<HTMLButtonElement>('reason-confirm')!.click();
    await stable();
  }

  it('shows the plan and its outdated version, the live grants and the history', async () => {
    await open();

    expect(text('plan-name')).toBe('School Pro school_pro · v2 Active');
    expect(text('plan-period')).toContain('open-ended');
    expect(text('plan-outdated')).toContain(
      "The school is on v2; the plan's latest version is v3.",
    );
    expect(text('plan-upgrade')).toBe('Move to v3');
    // The keys of the version the school is on (v2), not of the latest.
    expect(cells('plan-feature-row')).toEqual([
      ['ai.review_draft', 'On', '1000'],
      ['ai.practice', 'On', 'unmetered'],
      ['school.review_ai_policy', 'Off', '—'],
    ]);

    const live = cells('grant-row', find('plan-grants')!);
    expect(live).toHaveLength(2);
    expect(live[0].slice(0, 3)).toEqual(['ai.practice', 'switches on', '500']);
    expect(live[0][4]).toBe('Active');
    expect(live[1].slice(0, 3)).toEqual(['ai.authoring', 'switches off', '—']);
    expect(live[1][4]).toBe('Scheduled');

    expect(cells('plan-subscription-row').map((r) => r.slice(0, 2))).toEqual([
      ['School Pro v2', 'Active'],
      ['Free v1', 'Canceled'],
    ]);
    // Past grants are only the ended and revoked ones; live ones are above.
    const past = cells('grant-row', find('plan-history')!);
    expect(past).toHaveLength(1);
    expect(past[0][4]).toContain('Revoked');
  });

  it('shows a school subscription has never seen as on the free plan, without cancel', async () => {
    await open('admin', {
      lookup: lookup({
        hasAccount: false,
        source: 'free_plan',
        plan: { code: 'free_workspace', name: 'Free', version: 1 },
        subscription: null,
        activeGrants: 0,
      }),
      account: null,
      history: null,
      details: { ...PLAN_LIST[1], versions: [version(1)] },
    });
    expect(text('plan-name')).toBe('Free free_workspace · v1 free plan by default');
    expect(find('plan-no-account')).not.toBeNull();
    expect(find('plan-outdated')).toBeNull();
    expect(find('plan-cancel')).toBeNull();
    expect(find('plan-grants-empty')).not.toBeNull();
    expect(find('plan-subscriptions-empty')).not.toBeNull();
    expect(find('plan-assign')).not.toBeNull();
  });

  it('shows support everything but no change', async () => {
    await open('support');
    expect(find('plan-name')).not.toBeNull();
    for (const id of ['plan-assign', 'plan-cancel', 'plan-grant', 'grant-revoke', 'plan-upgrade']) {
      expect(find(id)).toBeNull();
    }
  });

  it('keeps the rest when the history fails, and retries it alone', async () => {
    TestBed.inject(SessionStore).start(sessionBody(adminToken()));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(`/schools/${ID}/plan`);
    el = harness.fixture.nativeElement as HTMLElement;
    await stable();
    http.expectOne(SCHOOL).flush(school);
    http.expectOne(LOOKUP).flush({ items: [lookup()] });
    (await next(ACCOUNT)).flush({ account: {}, subscription: subscription(), grants: [] });
    (await next(HISTORY)).flush(null, { status: 503, statusText: 'Unavailable' });
    (await next(PLANS)).flush(PLAN_LIST);
    (await next(`${PLANS}/school_pro`)).flush(proDetails);
    await stable();

    expect(find('plan-history-failed')).not.toBeNull();
    expect(find('plan-name')).not.toBeNull();
    expect(find('plan-grants-empty')).not.toBeNull();

    find<HTMLButtonElement>('plan-history-failed')!.querySelector('button')!.click();
    (await next(HISTORY)).flush({ account: {}, subscriptions: [], grants: [] });
    await stable();
    expect(find('plan-history-failed')).toBeNull();
    expect(find('plan-past-grants-empty')).not.toBeNull();
  });

  it('issues a grant that switches a key off, then reads the account again', async () => {
    await open();
    await click('plan-grant');
    await dialogShown();

    await pick('grant-key', 'ai.voice_review');
    expect(inPage('grant-credits')).not.toBeNull();
    await chooseButton('grant-effect', 'Off');
    // A switch-off carries no credits.
    expect(inPage('grant-credits')).toBeNull();

    // Not ready without an end: nothing is sent.
    await type('reason-input', 'School asked to pause voice checks');
    await confirm();
    expect(http.match((r) => r.method === 'POST')).toHaveLength(0);

    await type('grant-ends', day(-1));
    expect(inPage('grant-period-error')).not.toBeNull();
    await type('grant-ends', day(30));
    expect(inPage('grant-period-error')).toBeNull();
    await confirm();

    const post = await next(`${ACCOUNT}/grants`, 'POST');
    expect(post.request.body).toEqual({
      featureKey: 'ai.voice_review',
      enabled: false,
      endsAt: `${day(30)}T00:00:00.000Z`,
      reason: 'School asked to pause voice checks',
    });
    post.flush(
      { account: {}, subscription: subscription(), grants: [] },
      { status: 201, statusText: 'Created' },
    );

    // The card's header and the tab read again.
    (await next(LOOKUP, 'POST')).flush({ items: [lookup()] });
    (await next(SCHOOL)).flush(school);
    await answerReads({}, false);
    expect(inPage('reason-dialog')).toBeNull();
  });

  it("shows the seats: usage, the limit now, the plan's and the grant's part", async () => {
    const seatsGrant = grant({
      id: 'g-seats',
      featureKey: 'seats.students',
      monthlyCredits: null,
      limits: { max: 150 },
    });
    await open('admin', {
      details: {
        ...proDetails,
        versions: [
          {
            ...version(2, [
              {
                featureKey: 'seats.students',
                enabled: true,
                monthlyCredits: null,
                limits: { max: 100 },
              },
            ]),
          },
        ],
      },
      account: {
        account: { id: 'a-1', type: 'workspace', externalId: ID, createdAt: '2026-01-01' },
        subscription: subscription(),
        grants: [seatsGrant],
      },
    });
    expect(text('plan-seats-usage')).toContain('7 / 100');
    expect(text('plan-seats-limit')).toBe('100');
    expect(text('plan-seats-plan')).toBe('100');
    expect(text('plan-seats-grant')).toBe('150');
    // A grant row shows its limit, not "unmetered".
    expect(cells('grant-row')[0][2]).toBe('up to 150');
  });

  it('gives seats a number field instead of credits and an effect, and sends limits.max', async () => {
    await open();
    await click('plan-grant');
    await dialogShown();
    await pick('grant-key', 'seats.students');
    expect(inPage('grant-credits')).toBeNull();
    expect(inPage('grant-effect')).toBeNull();
    await type('reason-input', 'School grew mid-term');
    await type('grant-ends', day(30));
    await type('grant-seats', '12,5');
    expect(inPage('grant-seats-error')).not.toBeNull();
    await confirm();
    expect(http.match((r) => r.method === 'POST')).toHaveLength(0);
    await type('grant-seats', '150');
    expect(inPage('grant-seats-error')).toBeNull();
    await confirm();

    const post = await next(`${ACCOUNT}/grants`, 'POST');
    expect(post.request.body).toEqual({
      featureKey: 'seats.students',
      enabled: true,
      limits: { max: 150 },
      endsAt: `${day(30)}T00:00:00.000Z`,
      reason: 'School grew mid-term',
    });
    post.flush({ statusCode: 500 }, { status: 500, statusText: 'Error' });
    await stable();
  });

  it('issues credits on top of the plan from a later start', async () => {
    await open();
    await click('plan-grant');
    await dialogShown();
    await pick('grant-key', 'ai.practice');
    await type('grant-credits', '12,5');
    expect(inPage('grant-credits-error')).not.toBeNull();
    await type('grant-credits', '250');
    await type('grant-starts', day(3));
    await type('grant-ends', day(40));
    await type('reason-input', 'Exam month');
    await confirm();

    const post = await next(`${ACCOUNT}/grants`, 'POST');
    expect(post.request.body).toEqual({
      featureKey: 'ai.practice',
      enabled: true,
      monthlyCredits: '250',
      startsAt: `${day(3)}T00:00:00.000Z`,
      endsAt: `${day(40)}T00:00:00.000Z`,
      reason: 'Exam month',
    });
    post.flush(
      { statusCode: 422, code: 'invalid_credits' },
      { status: 422, statusText: 'Unprocessable' },
    );
    await stable();
    expect(text('reason-error-code', document.body)).toBe('invalid_credits');
  });

  it('revokes a grant; a 409 reads as "changed meanwhile"', async () => {
    await open();
    find('plan-grants')!.querySelector<HTMLButtonElement>('[data-testid="grant-revoke"]')!.click();
    await dialogShown();
    expect(text('revoke-text', document.body)).toBe(
      'ai.practice goes back to what the plan gives, now.',
    );
    await type('reason-input', 'Pilot over');
    await confirm();

    const post = await next(`${ACCOUNT}/grants/g-1/revoke`, 'POST');
    expect(post.request.body).toEqual({ reason: 'Pilot over' });
    post.flush({ statusCode: 409 }, { status: 409, statusText: 'Conflict' });
    await stable();
    expect(text('reason-error', document.body)).toContain('It has changed meanwhile.');
  });

  it('cancels the subscription with the reason in the query', async () => {
    await open();
    await click('plan-cancel');
    await dialogShown();
    expect(text('cancel-text', document.body)).toContain('“School Pro”');
    await type('reason-input', 'School closed its contract');
    await confirm();

    const req = await next(`${ACCOUNT}/subscription`, 'DELETE');
    expect(req.request.params.get('reason')).toBe('School closed its contract');
    req.flush({ account: {}, subscription: null, grants: [] });
    (await next(LOOKUP, 'POST')).flush({ items: [lookup()] });
    (await next(SCHOOL)).flush(school);
    await answerReads({}, false);
  });

  it('moves the school to the latest version of its plan, offering only its audience', async () => {
    await open();
    await click('plan-upgrade');
    await dialogShown();
    // Preset to the plan the school is on.
    expect(text('assign-same-plan', document.body)).toBe(
      'The school is on this plan already: assigning it moves the school to v3.',
    );

    inPage('assign-plan')!.click();
    await stable();
    await vi.waitFor(async () => {
      await stable();
      expect(document.body.querySelectorAll('[role="option"]').length).toBeGreaterThan(0);
    });
    const offered = [...document.body.querySelectorAll('[role="option"]')].map((o) =>
      o.textContent!.replace(/\s+/g, ' ').trim(),
    );
    expect(offered).toEqual(['School Pro school_pro · v3', 'Free free_workspace · v1']);
    document.body.querySelector<HTMLElement>('[role="option"]')!.click();
    await stable();

    // A trial needs its end.
    await chooseButton('assign-status', 'Trial');
    await type('reason-input', 'Move to the new terms');
    await confirm();
    expect(http.match((r) => r.method === 'PUT')).toHaveLength(0);
    await type('assign-period-end', day(14));
    await confirm();

    const put = await next(`${ACCOUNT}/subscription`, 'PUT');
    expect(put.request.body).toEqual({
      planCode: 'school_pro',
      status: 'trial',
      periodEnd: `${day(14)}T00:00:00.000Z`,
      reason: 'Move to the new terms',
    });
    put.flush({ account: {}, subscription: subscription({ planVersion: 3 }), grants: [] });
    (await next(LOOKUP, 'POST')).flush({
      items: [lookup({ plan: { code: 'school_pro', name: 'School Pro', version: 3 } })],
    });
    (await next(SCHOOL)).flush(school);
    await answerReads({}, false);
    expect(find('plan-outdated')).toBeNull();
  });
});
