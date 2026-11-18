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
import { AdminUserSchoolsDto } from '../../../api/organization/models/admin-user-schools-dto';
import { AccountLookupItemDto } from '../../../api/subscription/models/account-lookup-item-dto';
import { PlanResponseDto } from '../../../api/subscription/models/plan-response-dto';
import { routes } from '../../../app.routes';
import { provideApiClients } from '../../../core/api/provide-api-clients';
import { AdminLevel } from '../../../core/auth/admin-level';
import { AdminUserDetail } from '../../../core/auth/admin-users.api';
import { SessionStore } from '../../../core/auth/session.store';
import { adminToken, sessionBody, settle } from '../../../core/auth/testing';
import { APP_CONFIG } from '../../../core/config/app-config';
// Real English texts, so a missing key would show up as the key itself.
import en from '../../../../../public/i18n/en.json';

const ID = '5e0c1b2a-0000-4000-8000-000000000042';
const USER = `http://gw/api/v1/auth/admin/users/${ID}`;
const LOOKUP = 'http://gw/api/v1/admin/subscriptions/accounts/lookup';
const ACCOUNT = `http://gw/api/v1/admin/subscriptions/accounts/user/${ID}`;
const HISTORY = `${ACCOUNT}/history`;
const PLANS = 'http://gw/api/v1/admin/subscriptions/plans';
const SCHOOLS = `http://gw/api/v1/admin/users/${ID}/schools`;
const USAGE = `http://gw/api/v1/admin/ai/usage/user/${ID}`;
const POLICY = `http://gw/api/v1/admin/ai/payer-policies/user/${ID}`;
const AUDIT = 'http://gw/api/v1/admin/audit';

const future = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

export function userDetail(overrides: Partial<AdminUserDetail> = {}): AdminUserDetail {
  return {
    id: ID,
    email: 'kari@example.no',
    roles: ['student'],
    adminLevel: null,
    emailVerified: true,
    twoFactorEnabled: false,
    blockedAt: null,
    lockedUntil: null,
    deletionRequestedAt: null,
    purgeAt: null,
    createdAt: '2026-03-05T10:00:00.000Z',
    lastLoginAt: '2026-11-17T08:30:00.000Z',
    block: null,
    failedLogins: { count: 0, lastAt: null, lockedUntil: null },
    mfaCodes: { available: true, failures: 0, lockedUntil: null },
    backupCodesLeft: 0,
    sessions: [
      {
        clientType: 'web',
        active: 1,
        lastIssuedAt: '2026-11-17T08:30:00.000Z',
        recent: [
          {
            issuedAt: '2026-11-17T08:30:00.000Z',
            expiresAt: '2026-11-24T08:30:00.000Z',
            deviceInfo: 'Firefox on Linux',
          },
        ],
      },
      { clientType: 'mobile', active: 0, lastIssuedAt: null, recent: [] },
      { clientType: 'admin', active: 0, lastIssuedAt: null, recent: [] },
    ],
    ...overrides,
  };
}

function account(overrides: Partial<AccountLookupItemDto> = {}): AccountLookupItemDto {
  return {
    externalId: ID,
    hasAccount: true,
    source: 'subscription',
    plan: { code: 'self_pro', name: 'Self Pro', version: 2 },
    subscription: { id: 'sub-1', status: 'active', periodStart: '2026-01-01', periodEnd: null },
    activeGrants: 0,
    scheduledGrants: 0,
    seats: null,
    ...overrides,
  };
}

const plan = (code: string, overrides: Partial<PlanResponseDto> = {}): PlanResponseDto => ({
  id: `p-${code}`,
  code,
  name: code,
  audience: 'individual',
  status: 'active',
  current: { version: 2, createdAt: '2026-01-01', createdBy: 'seed', features: [] },
  ...overrides,
});

describe('UserCardPage', () => {
  let http: HttpTestingController;
  let harness: RouterTestingHarness;
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

  async function open(url: string, level: AdminLevel = 'super'): Promise<void> {
    TestBed.inject(SessionStore).start(sessionBody(adminToken({ admin_level: level })));
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    el = harness.fixture.nativeElement as HTMLElement;
    await stable();
  }

  /** Answers the account and the plan; each may be replaced by an error status. */
  async function answer(
    user: AdminUserDetail | number = userDetail(),
    lookup: AccountLookupItemDto | number = account(),
  ): Promise<void> {
    const req = http.expectOne(USER);
    if (typeof user === 'number') req.flush({}, { status: user, statusText: 'Error' });
    else req.flush(user);
    const l = http.expectOne(LOOKUP);
    expect(l.request.body).toEqual({ type: 'user', ids: [ID] });
    if (typeof lookup === 'number') l.flush({}, { status: lookup, statusText: 'Error' });
    else l.flush({ items: [lookup] });
    await stable();
  }

  const find = (testId: string) => el.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
  const text = (testId: string) => find(testId)?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
  const url = () => TestBed.inject(Router).url;
  const activeTab = () =>
    el
      .querySelector('[data-testid="user-tabs"] [aria-current="page"]')
      ?.getAttribute('data-testid');

  describe('header and overview', () => {
    it('shows a skeleton, then the e-mail, badges, level, roles and own plan', async () => {
      await open(`/users/${ID}`);
      expect(find('user-skeleton')).not.toBeNull();
      await answer(
        userDetail({
          roles: ['student', 'platform_admin'],
          adminLevel: 'support',
          emailVerified: false,
        }),
        account({
          subscription: { id: 's', status: 'trial', periodStart: '2026-01-01', periodEnd: null },
        }),
      );
      expect(find('user-skeleton')).toBeNull();
      expect(text('page-title')).toBe('kari@example.no');
      expect(text('user-badges')).toBe('E-mail not confirmed');
      // The shell has the signed-in administrator's badge too; this one is in the card's header.
      expect(
        find('user-header')!.querySelector('[data-testid="level-badge"]')!.textContent!.trim(),
      ).toBe(en.level.support);
      expect(text('user-roles')).toBe('StudentPlatform admin');
      expect(text('user-plan')).toMatch(/^Own plan: Self Pro v2\s*trial$/);
      expect(find('user-plan')!.querySelector('a')!.getAttribute('href')).toBe(`/users/${ID}/plan`);
      expect(activeTab()).toBe('tab-overview');
      expect(text('account-level')).toBe(en.level.support);
      expect(text('access-not-blocked')).toBe('Not blocked.');
      expect(text('access-mfa-state')).toBe('Off');
      expect(text('sessions-web')).toContain('Firefox on Linux');
      expect(
        find('sessions-web')!.querySelector('[data-testid="sessions-active"]')!.textContent!.trim(),
      ).toBe('1');
      expect(find('overview-deletion')).toBeNull();
    });

    it('shows the block with who and why, a running lockout, the code lockout and a deletion', async () => {
      await open(`/users/${ID}`);
      await answer(
        userDetail({
          blockedAt: '2026-11-10T09:00:00.000Z',
          block: { at: '2026-11-10T09:00:00.000Z', by: 'admin-7', reason: 'Spam in reviews' },
          lockedUntil: future(0.01),
          failedLogins: { count: 5, lastAt: '2026-11-18T10:00:00.000Z', lockedUntil: future(0.01) },
          twoFactorEnabled: true,
          backupCodesLeft: 7,
          mfaCodes: { available: true, failures: 5, lockedUntil: future(0.01) },
          deletionRequestedAt: '2026-11-01T00:00:00.000Z',
          purgeAt: future(13.5),
        }),
      );
      expect(text('user-badges')).toContain('Blocked');
      expect(text('access-blocked')).toMatch(/^Blocked .*: no sign-in, no session\.$/);
      expect(find('access-blocked-by')!.getAttribute('href')).toBe('/users/admin-7');
      expect(text('access-block-reason')).toBe('Reason: Spam in reviews');
      expect(text('access-locked')).toMatch(/^Locked out until /);
      expect(text('access-mfa-state')).toBe('On · backup codes left: 7');
      expect(text('access-codes-locked')).toMatch(/^Two-factor codes locked until /);
      expect(text('deletion-purge-at')).toMatch(/^Erased on .* · 14 d left$/);
    });

    it('says when the two-factor code count could not be read', async () => {
      await open(`/users/${ID}`);
      await answer(userDetail({ mfaCodes: { available: false, failures: 0, lockedUntil: null } }));
      expect(text('access-codes-unknown')).toContain('Redis did not answer');
    });

    it('sends an unknown tab and /overview to the overview address', async () => {
      await open(`/users/${ID}/nonsense`);
      await answer();
      expect(url()).toBe(`/users/${ID}`);
      expect(activeTab()).toBe('tab-overview');
    });

    it('says "not found" for an id auth does not know, without tabs', async () => {
      await open(`/users/${ID}/schools`);
      await answer(404);
      expect(text('page-title')).toBe('User not found');
      expect(find('user-tabs')).toBeNull();
    });

    it('offers a retry when the account fails to load', async () => {
      await open(`/users/${ID}`);
      await answer(500);
      expect(text('user-error')).toContain('Could not load the account.');
      find('user-error')!.querySelector('button')!.click();
      await stable();
      http.expectOne(USER).flush(userDetail());
      await stable();
      expect(text('page-title')).toBe('kari@example.no');
    });

    it('keeps the card when the plan fails, and retries the plan alone', async () => {
      await open(`/users/${ID}`);
      await answer(userDetail(), 503);
      expect(text('user-plan')).toBe('Own plan: — Retry');
      find('user-plan-retry')!.click();
      await stable();
      http.expectOne(LOOKUP).flush({ items: [account()] });
      await stable();
      expect(text('user-plan')).toBe('Own plan: Self Pro v2');
    });
  });

  describe('schools tab', () => {
    const schools: AdminUserSchoolsDto = {
      userId: ID,
      owned: [
        {
          id: 'solo-1',
          name: 'Kari underviser',
          slug: 'kari',
          kind: 'SOLO',
          status: 'active',
          closesAt: null,
          purgeAt: null,
          createdAt: '2026-04-01T00:00:00.000Z',
          groups: [
            { id: 'g-0', name: 'Default', as: 'teacher', isDefault: true },
            { id: 'g-1', name: 'A2 kveld', as: 'teacher', isDefault: false },
          ],
        },
      ],
      memberships: [
        {
          school: {
            id: 'school-2',
            name: 'Nordick',
            slug: 'nordick',
            kind: 'SCHOOL',
            status: 'closed',
            closesAt: null,
            purgeAt: '2027-05-01T00:00:00.000Z',
          },
          role: 'student',
          rosterRole: 'STUDENT',
          status: 'archived',
          groups: [{ id: 'g-2', name: 'B1', as: 'student', isDefault: false }],
          joinedAt: '2026-02-01T00:00:00.000Z',
        },
      ],
    };

    it('lists what the account owns and where it is on the roster, linking each school', async () => {
      await open(`/users/${ID}/schools`);
      await answer();
      (await next(SCHOOLS)).flush(schools);
      await stable();
      expect(activeTab()).toBe('tab-schools');
      expect(text('owned-row')).toContain('Kari underviser');
      expect(text('owned-groups')).toBe('teaches: A2 kveld');
      expect(find('owned-link')!.getAttribute('href')).toBe('/schools/solo-1');
      expect(find('membership-link')!.getAttribute('href')).toBe('/schools/school-2');
      expect(text('membership-row')).toContain('Closed');
      expect(text('membership-row')).toContain('Archived');
      expect(text('membership-role')).toBe('Student');
    });

    it('says so when there is nothing, and retries a failed read', async () => {
      await open(`/users/${ID}/schools`);
      await answer();
      (await next(SCHOOLS)).flush({}, { status: 502, statusText: 'Bad Gateway' });
      await stable();
      expect(text('user-schools-failed')).toContain('Could not load the schools');
      find('user-schools-failed')!.querySelector('button')!.click();
      (await next(SCHOOLS)).flush({ userId: ID, owned: [], memberships: [] });
      await stable();
      expect(find('user-owned-empty')).not.toBeNull();
      expect(find('user-memberships-empty')).not.toBeNull();
    });
  });

  describe('shared payer tabs', () => {
    it('plan: reads the user account and offers individual plans, with no seats', async () => {
      await open(`/users/${ID}/plan`);
      await answer(userDetail(), account({ hasAccount: false, subscription: null }));
      (await next(ACCOUNT)).flush({}, { status: 404, statusText: 'Not Found' });
      (await next(HISTORY)).flush({}, { status: 404, statusText: 'Not Found' });
      (await next(PLANS)).flush([
        plan('self_pro', { name: 'Self Pro' }),
        plan('school_pro', { audience: 'workspace' }),
      ]);
      (await next(`${PLANS}/self_pro`)).flush({
        ...plan('self_pro'),
        versions: [plan('self_pro').current],
      });
      await stable();
      expect(activeTab()).toBe('tab-plan');
      expect(el.textContent).toContain(en.users.payer.plan.noAccount);
      expect(el.textContent).not.toContain(en.schools.plan.noAccount);
      expect(find('plan-seats')).toBeNull();
    });

    it('AI: reads usage, policy and grants of the user payer, and no school settings', async () => {
      await open(`/users/${ID}/ai`);
      await answer();
      (await next(USAGE)).flush({
        payerType: 'user',
        payerId: ID,
        policy: {
          payerType: 'user',
          payerId: ID,
          aiEnabled: false,
          allowedRegions: null,
          stored: true,
          updatedAt: null,
          updatedBy: null,
        },
        features: [],
      });
      (await next(ACCOUNT)).flush({
        account: { id: 'a-1', type: 'user', externalId: ID, createdAt: '2026-01-01' },
        subscription: null,
        grants: [],
      });
      (await next(POLICY)).flush({
        payerType: 'user',
        payerId: ID,
        aiEnabled: false,
        allowedRegions: null,
        stored: true,
        updatedAt: '2026-11-01T00:00:00.000Z',
        updatedBy: 'admin-1',
      });
      await stable();
      expect(find('ai-settings')).toBeNull();
      expect(text('ai-policy-off')).toContain("this learner's own account");
      // afterEach's verify(): no `admin/schools/:id/settings` was asked.
    });

    it('journal: reads the entries about this account and links the actor to their card', async () => {
      await open(`/users/${ID}/journal`);
      await answer();
      const req = await next(AUDIT);
      expect(req.request.params.get('targetType')).toBe('user');
      expect(req.request.params.get('targetId')).toBe(ID);
      req.flush({
        items: [
          {
            id: 'e-1',
            service: 'auth',
            actorId: 'admin-7',
            actorLevel: 'admin',
            action: 'user.blocked',
            targetType: 'user',
            targetId: ID,
            reason: 'Spam',
            before: null,
            after: null,
            occurredAt: '2026-11-18T09:00:00.000Z',
          },
        ],
        nextCursor: null,
      });
      await stable();
      expect(text('journal-action')).toBe('Account blocked');
      expect(find('journal-actor')!.getAttribute('href')).toBe('/users/admin-7');
    });
  });
});
