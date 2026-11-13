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
import { AdminAuditEntryDto } from '../../../../api/analytics/models/admin-audit-entry-dto';
import { AdminSchoolDetailDto } from '../../../../api/organization/models/admin-school-detail-dto';
import { routes } from '../../../../app.routes';
import { provideApiClients } from '../../../../core/api/provide-api-clients';
import { SessionStore } from '../../../../core/auth/session.store';
import { adminToken, sessionBody, settle } from '../../../../core/auth/testing';
import { APP_CONFIG } from '../../../../core/config/app-config';
// Real English texts, so a missing key would show up as the key itself.
import en from '../../../../../../public/i18n/en.json';

const ID = '7d3c1b2a-0000-4000-8000-000000000001';
const SCHOOL = `http://gw/api/v1/admin/schools/${ID}`;
const LOOKUP = 'http://gw/api/v1/admin/subscriptions/accounts/lookup';
const AUDIT = 'http://gw/api/v1/admin/audit';

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
  closesAt: null,
  purgeAt: null,
  statusChangedAt: null,
  statusReason: null,
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
  activeGrants: 0,
  scheduledGrants: 0,
  seats: null,
};

function entry(overrides: Partial<AdminAuditEntryDto> = {}): AdminAuditEntryDto {
  return {
    id: 'e-1',
    service: 'subscription',
    action: 'grant.issued',
    actorId: 'admin-1',
    actorLevel: 'admin',
    targetType: 'workspace',
    targetId: ID,
    reason: 'Pilot extension',
    before: null,
    after: { featureKey: 'ai.practice', enabled: true },
    occurredAt: '2026-11-09T10:30:00.000Z',
    ...overrides,
  };
}

describe('SchoolJournalTab', () => {
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

  async function nextAudit(): Promise<TestRequest> {
    let req!: TestRequest;
    await vi.waitFor(async () => {
      await stable();
      const found = http.match((r) => r.url === AUDIT);
      expect(found).toHaveLength(1);
      req = found[0];
    });
    return req;
  }

  /** Opens the tab; the first page is answered by the test (`'fail'` = 503). */
  async function open(first: object | 'fail'): Promise<TestRequest> {
    TestBed.inject(SessionStore).start(sessionBody(adminToken({ admin_level: 'support' })));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(`/schools/${ID}/journal`);
    el = harness.fixture.nativeElement as HTMLElement;
    await stable();
    http.expectOne(SCHOOL).flush(school);
    http.expectOne(LOOKUP).flush({ items: [lookup] });
    const req = await nextAudit();
    if (first === 'fail') req.flush(null, { status: 503, statusText: 'Unavailable' });
    else req.flush(first);
    await stable();
    return req;
  }

  const find = (testId: string) => el.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
  const text = (testId: string) => find(testId)?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
  const all = (testId: string) => [
    ...el.querySelectorAll<HTMLElement>(`[data-testid="${testId}"]`),
  ];

  it('asks for the entries about this school, newest first, and lists them', async () => {
    const req = await open({
      items: [
        entry(),
        entry({
          id: 'e-2',
          service: 'ai',
          action: 'payer_policy.changed',
          actorId: null,
          actorLevel: null,
          reason: null,
          before: null,
          after: null,
        }),
      ],
      nextCursor: null,
    });
    expect(req.request.params.get('targetType')).toBe('workspace');
    expect(req.request.params.get('targetId')).toBe(ID);
    expect(req.request.params.get('cursor')).toBeNull();

    expect(all('journal-action').map((a) => a.textContent!.trim())).toEqual([
      'Grant issued',
      'Payer policy changed',
    ]);
    expect(all('journal-actor').map((a) => a.textContent!.trim())).toEqual(['admin-1', 'system']);
    expect(text('journal-reason')).toBe('Reason: Pilot extension');
    // No cursor: no "more"; an entry without a snapshot has nothing to unfold.
    expect(find('journal-more')).toBeNull();
    expect(all('journal-details')).toHaveLength(1);
  });

  it('shows an action the panel has no text for as it was written', async () => {
    await open({ items: [entry({ action: 'school.frozen' })], nextCursor: null });
    expect(text('journal-action')).toBe('school.frozen');
  });

  it('shows the before and after of an entry', async () => {
    await open({
      items: [entry({ before: { enabled: false }, after: { enabled: true } })],
      nextCursor: null,
    });
    expect(JSON.parse(text('journal-before')!)).toEqual({ enabled: false });
    expect(JSON.parse(text('journal-after')!)).toEqual({ enabled: true });
  });

  it('says so when there are no entries', async () => {
    await open({ items: [], nextCursor: null });
    expect(text('journal-empty')).toBe('No admin actions on this school yet.');
  });

  it('appends the next page by the cursor and drops "more" at the end', async () => {
    await open({ items: [entry({ id: 'e-1' })], nextCursor: 'c-1' });
    expect(all('journal-action')).toHaveLength(1);

    find('journal-more')!.click();
    const req = await nextAudit();
    expect(req.request.params.get('cursor')).toBe('c-1');
    req.flush({ items: [entry({ id: 'e-2', action: 'grant.revoked' })], nextCursor: null });
    await stable();

    expect(all('journal-action').map((a) => a.textContent!.trim())).toEqual([
      'Grant issued',
      'Grant revoked',
    ]);
    expect(find('journal-more')).toBeNull();
  });

  it('keeps the entries when "more" fails and retries the same cursor', async () => {
    await open({ items: [entry()], nextCursor: 'c-1' });

    find('journal-more')!.click();
    (await nextAudit()).flush(null, { status: 503, statusText: 'Unavailable' });
    await stable();
    expect(all('journal-action')).toHaveLength(1);
    expect(find('journal-more-failed')).not.toBeNull();

    find('journal-more')!.click();
    const retry = await nextAudit();
    expect(retry.request.params.get('cursor')).toBe('c-1');
    retry.flush({ items: [entry({ id: 'e-2' })], nextCursor: null });
    await stable();
    expect(all('journal-action')).toHaveLength(2);
    expect(find('journal-more-failed')).toBeNull();
  });

  it('offers a retry when the first page fails', async () => {
    await open('fail');
    expect(text('journal-failed')).toContain('Could not load the journal');

    el.querySelector<HTMLButtonElement>('[data-testid="journal-failed"] button')!.click();
    (await nextAudit()).flush({ items: [entry()], nextCursor: null });
    await stable();
    expect(find('journal-failed')).toBeNull();
    expect(all('journal-action')).toHaveLength(1);
  });
});
