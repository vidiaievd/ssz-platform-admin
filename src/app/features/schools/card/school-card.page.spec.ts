import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { AdminSchoolDetailDto } from '../../../api/organization/models/admin-school-detail-dto';
import { AccountLookupItemDto } from '../../../api/subscription/models/account-lookup-item-dto';
import { routes } from '../../../app.routes';
import { provideApiClients } from '../../../core/api/provide-api-clients';
import { SessionStore } from '../../../core/auth/session.store';
import { adminToken, sessionBody, settle } from '../../../core/auth/testing';
import { APP_CONFIG } from '../../../core/config/app-config';
// Real English texts, so a missing key would show up as the key itself.
import en from '../../../../../public/i18n/en.json';

const ID = '7d3c1b2a-0000-4000-8000-000000000001';
const SCHOOL = `http://gw/api/v1/admin/schools/${ID}`;
const AUDIT = 'http://gw/api/v1/admin/audit';
const LOOKUP = 'http://gw/api/v1/admin/subscriptions/accounts/lookup';

function detail(overrides: Partial<AdminSchoolDetailDto> = {}): AdminSchoolDetailDto {
  return {
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
    closesAt: null,
    purgeAt: null,
    statusChangedAt: null,
    statusReason: null,
    contacts: { email: null, website: null, city: null },
    owner: { userId: 'owner-1', name: 'Kari Nordmann', email: null },
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
    ...overrides,
  };
}

function account(overrides: Partial<AccountLookupItemDto> = {}): AccountLookupItemDto {
  return {
    externalId: ID,
    hasAccount: true,
    source: 'subscription',
    plan: { code: 'pro', name: 'Pro', version: 3 },
    subscription: { id: 'sub-1', status: 'active', periodStart: '2026-01-01', periodEnd: null },
    activeGrants: 0,
    scheduledGrants: 0,
    seats: null,
    ...overrides,
  };
}

describe('SchoolCardPage', () => {
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
    TestBed.inject(SessionStore).start(sessionBody(adminToken()));
  });

  afterEach(() => http.verify());

  /** Not `whenStable()`: in a zoneless app it also waits for unanswered HTTP requests. */
  async function stable(): Promise<void> {
    for (let i = 0; i < 4; i++) {
      await settle();
      TestBed.tick();
    }
  }

  async function open(url: string): Promise<void> {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    el = harness.fixture.nativeElement as HTMLElement;
    await stable();
  }

  /** Answers the school and the plan; each may be replaced by an error. */
  async function answer(
    school: AdminSchoolDetailDto | { status: number } = detail(),
    plan: AccountLookupItemDto | { status: number } = account(),
  ): Promise<void> {
    const req = http.expectOne(SCHOOL);
    if ('id' in school) req.flush(school);
    else req.flush({ statusCode: school.status }, { status: school.status, statusText: 'Error' });
    const lookup = http.expectOne(LOOKUP);
    expect(lookup.request.body).toEqual({ type: 'workspace', ids: [ID] });
    if ('externalId' in plan) lookup.flush({ items: [plan] });
    else lookup.flush({}, { status: plan.status, statusText: 'Error' });
    await stable();
  }

  const text = (testId: string) =>
    el.querySelector(`[data-testid="${testId}"]`)?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
  const url = () => TestBed.inject(Router).url;
  const activeTab = () =>
    el
      .querySelector('[data-testid="school-tabs"] [aria-current="page"]')
      ?.getAttribute('data-testid');
  /** The tab on screen, by the root element of each built tab. */
  const shownTab = () =>
    el.querySelector('[data-testid="school-overview"]')
      ? 'overview'
      : el.querySelector('[data-testid="journal"]')
        ? 'journal'
        : null;

  it('shows a skeleton, then the header: name, kind, status, plan', async () => {
    await open(`/schools/${ID}`);
    expect(el.querySelector('[data-testid="school-skeleton"]')).not.toBeNull();
    await answer(
      detail({ kind: 'SOLO', status: 'suspended' }),
      account({
        subscription: { id: 's', status: 'trial', periodStart: '2026-01-01', periodEnd: null },
      }),
    );
    expect(el.querySelector('[data-testid="school-skeleton"]')).toBeNull();
    expect(text('page-title')).toBe('Nordick');
    expect(text('school-kind')).toBe('Tutor');
    expect(text('school-status')).toBe('Suspended');
    expect(text('school-plan')).toMatch(/^Plan: Pro v3\s*trial$/);
    expect(activeTab()).toBe('tab-overview');
    expect(shownTab()).toBe('overview');
  });

  it('shows seats in the header and links them to the plan tab', async () => {
    await open(`/schools/${ID}`);
    await answer(detail({ seats: { used: 103, limit: 100, ceiling: 110, state: 'warning' } }));
    expect(text('school-seats')).toBe('Seats: 103 / 100');
    const value = el.querySelector('[data-testid="school-seats-value"]')!;
    expect(value.getAttribute('data-level')).toBe('warning');
    expect(value.getAttribute('href')).toContain('/plan');
  });

  it('shows when a suspended school closes and when a closed one is purged', async () => {
    await open(`/schools/${ID}`);
    await answer(detail({ status: 'suspended', closesAt: '2099-10-01T12:00:00.000Z' }));
    expect(text('school-status')).toBe('Suspended');
    expect(text('school-closes-at')).toMatch(/^Closes .*2099.* · \d+ d left$/);
    expect(text('school-purge-at')).toBeNull();
  });

  it('marks a closed school with its purge date', async () => {
    await open(`/schools/${ID}`);
    await answer(detail({ status: 'closed', purgeAt: '2099-10-01T12:00:00.000Z' }));
    expect(text('school-status')).toBe('Closed');
    expect(text('school-purge-at')).toMatch(/^In the archive until .*2099.* · \d+ d to deletion$/);
    expect(text('school-closes-at')).toBeNull();
  });

  it('marks a purged school as a tombstone', async () => {
    await open(`/schools/${ID}`);
    await answer(detail({ status: 'purged' }));
    expect(text('school-status')).toBe('Purged');
    expect(text('school-purged')).toContain('tombstone');
  });

  it('keeps the tab in the URL and reads the school once for all tabs', async () => {
    // A tab reads its own data (the journal its entries); the card's school and plan stay.
    await open(`/schools/${ID}/journal`);
    await answer();
    http.expectOne((r) => r.url === AUDIT).flush({ items: [], nextCursor: null });
    await stable();
    expect(activeTab()).toBe('tab-journal');
    expect(shownTab()).toBe('journal');

    el.querySelector<HTMLElement>('[data-testid="tab-overview"]')!.click();
    await vi.waitFor(async () => {
      await stable();
      expect(shownTab()).toBe('overview');
    });
    expect(url()).toBe(`/schools/${ID}`);
    // afterEach's verify(): switching tabs asked nothing again.
  });

  it('sends an unknown tab and /overview to the overview address', async () => {
    await open(`/schools/${ID}/nonsense`);
    await answer();
    expect(url()).toBe(`/schools/${ID}`);
    expect(activeTab()).toBe('tab-overview');

    await harness.navigateByUrl(`/schools/${ID}/overview`);
    await stable();
    expect(url()).toBe(`/schools/${ID}`);
  });

  it('says "not found" for an id organization does not know, without tabs', async () => {
    await open(`/schools/${ID}/members`);
    await answer({ status: 404 });
    expect(text('page-title')).toBe('School not found');
    expect(el.querySelector('[data-testid="school-tabs"]')).toBeNull();
    expect(el.querySelector('[data-testid="school-error"]')).toBeNull();
  });

  it('offers a retry when the school fails to load', async () => {
    await open(`/schools/${ID}`);
    await answer({ status: 500 });
    expect(text('school-error')).toContain('Could not load the school.');
    el.querySelector<HTMLButtonElement>('[data-testid="school-error"] button')!.click();
    await stable();
    http.expectOne(SCHOOL).flush(detail());
    await stable();
    expect(text('page-title')).toBe('Nordick');
  });

  it('keeps the card when the plan fails, and retries the plan alone', async () => {
    await open(`/schools/${ID}`);
    await answer(detail(), { status: 503 });
    expect(text('page-title')).toBe('Nordick');
    expect(text('school-plan')).toBe('Plan: — Retry');

    el.querySelector<HTMLButtonElement>('[data-testid="school-plan-retry"]')!.click();
    await stable();
    http
      .expectOne(LOOKUP)
      .flush({ items: [account({ plan: { code: 'f', name: 'Free', version: 1 } })] });
    await stable();
    expect(text('school-plan')).toBe('Plan: Free v1');
  });
});
