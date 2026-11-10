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
import { PayerFeatureUsageDto } from '../../../../api/ai/models/payer-feature-usage-dto';
import { PayerPolicyResponseDto } from '../../../../api/ai/models/payer-policy-response-dto';
import { AdminSchoolDetailDto } from '../../../../api/organization/models/admin-school-detail-dto';
import { AdminSchoolSettingsDto } from '../../../../api/organization/models/admin-school-settings-dto';
import { GrantResponseDto } from '../../../../api/subscription/models/grant-response-dto';
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
const SETTINGS = `${SCHOOL}/settings`;
const LOOKUP = 'http://gw/api/v1/admin/subscriptions/accounts/lookup';
const ACCOUNT = `http://gw/api/v1/admin/subscriptions/accounts/workspace/${ID}`;
const USAGE = `http://gw/api/v1/admin/ai/usage/workspace/${ID}`;
const POLICY = `http://gw/api/v1/admin/ai/payer-policies/workspace/${ID}`;

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

const lookup = {
  externalId: ID,
  hasAccount: true,
  source: 'subscription',
  plan: { code: 'school_pro', name: 'School Pro', version: 2 },
  subscription: null,
  activeGrants: 1,
  scheduledGrants: 0,
  seats: null,
};

function feature(overrides: Partial<PayerFeatureUsageDto>): PayerFeatureUsageDto {
  return {
    feature: 'ai.practice',
    enabled: true,
    used: '380.587000',
    total: '500',
    periodEnd: '2026-12-01T00:00:00.000Z',
    limits: {},
    ...overrides,
  };
}

const offFeature = { enabled: false, used: null, total: null, periodEnd: null } as const;

function grant(overrides: Partial<GrantResponseDto> = {}): GrantResponseDto {
  return {
    id: 'g-1',
    featureKey: 'ai.voice_review',
    enabled: false,
    monthlyCredits: null,
    limits: {},
    startsAt: '2026-11-01T00:00:00.000Z',
    endsAt: '2026-12-15T00:00:00.000Z',
    state: 'active',
    reason: 'School asked to pause voice checks',
    createdAt: '2026-11-01T00:00:00.000Z',
    createdBy: 'admin-1',
    revokedAt: null,
    revokedBy: null,
    ...overrides,
  };
}

function policy(overrides: Partial<PayerPolicyResponseDto> = {}): PayerPolicyResponseDto {
  return {
    payerType: 'workspace',
    payerId: ID,
    aiEnabled: true,
    allowedRegions: null,
    stored: false,
    updatedAt: null,
    updatedBy: null,
    ...overrides,
  };
}

const usage = {
  payerType: 'workspace',
  payerId: ID,
  policy: policy(),
  features: [
    feature({ feature: 'ai.practice' }),
    feature({ feature: 'ai.review_draft', used: '12', total: null }),
    feature({ feature: 'ai.voice_review', ...offFeature }),
    feature({ feature: 'ai.authoring', ...offFeature }),
    feature({ feature: 'ai.student_assist', used: '21.4', total: '20' }),
  ],
};

const settings: AdminSchoolSettingsDto = {
  aiPrecheck: { enabled: true, perExerciseLimit: 3, perLearnerMonthlyCredits: null },
  assistant: { mode: 'selected_groups', groupIds: ['g1', 'g2'], studentIds: [] },
  reviewAi: { mode: 'ai_with_sampling', samplePercent: 20, autoAcceptAfterHours: 48 },
  review: { respondWithinHours: 24, escalateAfterHours: 72, escalateTo: 'owner' },
};

describe('SchoolAiTab', () => {
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
    usage?: unknown;
    policy?: unknown;
    grants?: GrantResponseDto[];
    settings?: unknown;
  }

  const unavailable = { status: 503, statusText: 'Unavailable' };

  async function answerUsageAndGrants(answers: Answers = {}): Promise<void> {
    const u = await next(USAGE);
    if (answers.usage === 'fail') u.flush(null, unavailable);
    else u.flush(answers.usage ?? usage);
    (await next(ACCOUNT)).flush({
      account: { id: 'a-1', type: 'workspace', externalId: ID, createdAt: '2026-01-01' },
      subscription: null,
      grants: answers.grants ?? [grant()],
    });
  }

  async function open(level: AdminLevel = 'admin', answers: Answers = {}): Promise<void> {
    TestBed.inject(SessionStore).start(sessionBody(adminToken({ admin_level: level })));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(`/schools/${ID}/ai`);
    el = harness.fixture.nativeElement as HTMLElement;
    await stable();
    http.expectOne(SCHOOL).flush(school);
    http.expectOne(LOOKUP).flush({ items: [lookup] });
    await answerUsageAndGrants(answers);
    const p = await next(POLICY);
    if (answers.policy === 'fail') p.flush(null, unavailable);
    else p.flush(answers.policy ?? policy());
    (await next(SETTINGS)).flush(answers.settings ?? settings);
    await stable();
  }

  const find = <T extends HTMLElement = HTMLElement>(testId: string, root: ParentNode = el) =>
    root.querySelector<T>(`[data-testid="${testId}"]`);
  const inPage = <T extends HTMLElement = HTMLElement>(testId: string) =>
    find<T>(testId, document.body);
  const text = (testId: string, root: ParentNode = el) =>
    find(testId, root)?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
  const rows = () =>
    [...el.querySelectorAll('[data-testid="ai-key-row"]')].map((row) =>
      [...row.children].map((td) => td.textContent!.replace(/\s+/g, ' ').trim()),
    );
  const row = (key: string) =>
    [...el.querySelectorAll<HTMLElement>('[data-testid="ai-key-row"]')].find(
      (r) => r.children[0].textContent!.trim() === key,
    )!;

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

  async function chooseButton(testId: string, label: string): Promise<void> {
    [...inPage(testId)!.querySelectorAll<HTMLElement>('button, [role="radio"], .p-togglebutton')]
      .find((b) => b.textContent!.trim() === label)!
      .click();
    await stable();
  }

  async function check(testId: string): Promise<void> {
    inPage(testId)!.querySelector<HTMLInputElement>('input')!.click();
    await stable();
  }

  async function confirm(): Promise<void> {
    inPage<HTMLButtonElement>('reason-confirm')!.click();
    await stable();
  }

  it('shows each key with its source and spend, the policy and the school settings', async () => {
    await open();

    expect(rows().map((r) => r.slice(0, 4))).toEqual([
      // Numbers follow the panel's language (uk by default), texts the test's (en).
      ['ai.practice', 'On', 'plan', '380,59 / 500'],
      ['ai.review_draft', 'On', 'plan', '12 · unmetered'],
      ['ai.voice_review', 'Off', 'grant · off', '—'],
      ['ai.authoring', 'Off', 'not in plan', '—'],
      ['ai.student_assist', 'On', 'plan', "21,4 / 20 over the period's credits"],
    ]);
    expect(find('ai-key-switch-off', row('ai.practice'))).not.toBeNull();
    expect(find('ai-key-revoke-off', row('ai.voice_review'))).not.toBeNull();
    expect(find('ai-key-switch-on', row('ai.authoring'))).not.toBeNull();
    expect(find('ai-policy-off')).toBeNull();

    expect(text('ai-policy-enabled')).toBe('On');
    expect(text('ai-policy-regions')).toBe('any region');
    expect(text('ai-policy-stored')).toContain('never set');

    expect(text('settings-precheck')).toContain('Checks per exercise 3');
    expect(text('settings-precheck')).toContain('no limit');
    expect(text('settings-assistant')).toContain('selected groups (groups: 2)');
    expect(text('settings-review-ai')).toContain('AI, teacher samples');
    expect(text('settings-review-ai')).toContain('20 %');
    expect(text('settings-review')).toContain('72 h → owner');
  });

  it('shows support everything but no change', async () => {
    await open('support');
    expect(rows()).toHaveLength(5);
    for (const id of [
      'ai-key-switch-off',
      'ai-key-switch-on',
      'ai-key-revoke-off',
      'ai-policy-change',
    ]) {
      expect(find(id)).toBeNull();
    }
  });

  it('says when the policy switches all AI off, and keeps the rest when usage fails', async () => {
    await open('admin', {
      usage: 'fail',
      policy: policy({
        aiEnabled: false,
        allowedRegions: ['eu', 'local'],
        stored: true,
        updatedAt: '2026-11-05T10:00:00.000Z',
        updatedBy: 'admin-7',
      }),
    });
    expect(find('ai-policy-off')).not.toBeNull();
    expect(find('ai-keys-failed')).not.toBeNull();
    expect(text('ai-policy-enabled')).toBe('Off');
    expect(text('ai-policy-regions')).toBe('EU, self-hosted (local)');
    expect(text('ai-policy-stored')).toContain('admin-7');
    expect(find('settings-review')).not.toBeNull();

    find('ai-keys-failed')!.querySelector('button')!.click();
    (await next(USAGE)).flush(usage);
    await stable();
    expect(rows()).toHaveLength(5);
  });

  it('switches a key off with a grant preset to it, then reads the keys again', async () => {
    await open();
    find<HTMLButtonElement>('ai-key-switch-off', row('ai.practice'))!.click();
    await dialogShown();
    expect(inPage('grant-key')!.textContent).toContain('ai.practice');
    // A switch-off carries no credits.
    expect(inPage('grant-credits')).toBeNull();

    await type('grant-ends', day(14));
    await type('reason-input', 'Abuse of the rehearsal');
    await confirm();

    const post = await next(`${ACCOUNT}/grants`, 'POST');
    expect(post.request.body).toEqual({
      featureKey: 'ai.practice',
      enabled: false,
      endsAt: `${day(14)}T00:00:00.000Z`,
      reason: 'Abuse of the rehearsal',
    });
    post.flush(
      { account: {}, subscription: null, grants: [] },
      { status: 201, statusText: 'Created' },
    );

    // The keys, their grants and the card's header read again.
    (await next(LOOKUP, 'POST')).flush({ items: [lookup] });
    await answerUsageAndGrants();
    await stable();
    expect(inPage('reason-dialog')).toBeNull();
  });

  it('switches a key on with a grant that may add credits', async () => {
    await open();
    find<HTMLButtonElement>('ai-key-switch-on', row('ai.authoring'))!.click();
    await dialogShown();
    expect(inPage('grant-key')!.textContent).toContain('ai.authoring');
    expect(inPage('grant-credits')).not.toBeNull();
    await chooseButton('grant-effect', 'Off');
    expect(inPage('grant-credits')).toBeNull();
  });

  it('brings a switched-off key back by revoking its grant', async () => {
    await open();
    find<HTMLButtonElement>('ai-key-revoke-off', row('ai.voice_review'))!.click();
    await dialogShown();
    expect(text('revoke-text', document.body)).toBe(
      'ai.voice_review is no longer switched off; the plan decides again, now.',
    );
    expect(text('revoke-grant-reason', document.body)).toContain('pause voice checks');
    await type('reason-input', 'Pause over');
    await confirm();

    const post = await next(`${ACCOUNT}/grants/g-1/revoke`, 'POST');
    expect(post.request.body).toEqual({ reason: 'Pause over' });
    post.flush({ account: {}, subscription: null, grants: [] });
    (await next(LOOKUP, 'POST')).flush({ items: [lookup] });
    await answerUsageAndGrants({ grants: [] });
    await stable();
    expect(inPage('reason-dialog')).toBeNull();
  });

  it('changes the policy with the reason and reads it again', async () => {
    await open();
    find<HTMLButtonElement>('ai-policy-change')!.click();
    await dialogShown();

    await check('policy-any-region');
    // No region picked: not ready, nothing is sent.
    expect(inPage('policy-regions-error')).not.toBeNull();
    await type('reason-input', 'GDPR request of the school');
    await confirm();
    expect(http.match((r) => r.method === 'PUT')).toHaveLength(0);

    await check('policy-region-local');
    await check('policy-region-eu');
    await chooseButton('policy-ai', 'Off');
    await confirm();

    const put = await next(POLICY, 'PUT');
    expect(put.request.body).toEqual({
      aiEnabled: false,
      allowedRegions: ['eu', 'local'],
      reason: 'GDPR request of the school',
    });
    put.flush(policy({ aiEnabled: false, allowedRegions: ['eu', 'local'], stored: true }));
    (await next(POLICY)).flush(
      policy({ aiEnabled: false, allowedRegions: ['eu', 'local'], stored: true }),
    );
    await stable();
    expect(find('ai-policy-off')).not.toBeNull();
    expect(text('ai-policy-regions')).toBe('EU, self-hosted (local)');
  });
});
