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
import { AdminMemberDto } from '../../../api/organization/models/admin-member-dto';
import { AdminSchoolDetailDto } from '../../../api/organization/models/admin-school-detail-dto';
import { routes } from '../../../app.routes';
import { provideApiClients } from '../../../core/api/provide-api-clients';
import { SessionStore } from '../../../core/auth/session.store';
import { adminToken, sessionBody, settle } from '../../../core/auth/testing';
import { APP_CONFIG } from '../../../core/config/app-config';
// Real English texts, so a missing key would show up as the key itself.
import en from '../../../../../public/i18n/en.json';

const ID = '7d3c1b2a-0000-4000-8000-000000000001';
const GROUP = '0b5f8d3a-1111-4000-8000-000000000001';
const SCHOOL = `http://gw/api/v1/admin/schools/${ID}`;
const MEMBERS = `${SCHOOL}/members`;
const LOOKUP = 'http://gw/api/v1/admin/subscriptions/accounts/lookup';
const PROFILES = 'http://gw/api/v1/profiles';

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
    owner: { userId: 'owner-1', name: 'Kari Nordmann', email: 'kari@nordick.no' },
    counts: {
      students: 1,
      archivedStudents: 1,
      teachers: 1,
      staff: 1,
      pendingApplications: 0,
      pendingInvitations: 0,
    },
    groups: [
      {
        id: GROUP,
        name: 'NO-A2-2026',
        level: 'A2',
        status: 'active',
        students: 1,
        courseId: null,
        isDefault: false,
      },
    ],
    courses: { count: 0, ids: [] },
    seats: { used: 7, limit: 100, ceiling: 110, state: 'ok' },
    ...overrides,
  };
}

function member(overrides: Partial<AdminMemberDto> = {}): AdminMemberDto {
  return {
    userId: 'u-1',
    name: 'Ola Nordmann',
    role: 'student',
    rosterRole: 'STUDENT',
    status: 'active',
    joinedAt: '2026-09-01T10:00:00.000Z',
    groups: [{ id: GROUP, name: 'NO-A2-2026', as: 'student', isDefault: false }],
    ...overrides,
  };
}

const page = (items: AdminMemberDto[], total = items.length, pageNo = 1, limit = 50) => ({
  items,
  total,
  page: pageNo,
  limit,
});

describe('SchoolMembersTab', () => {
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

  /** Opens the tab, answers the card, and returns the first roster request. */
  async function open(path = '', school = detail()): Promise<TestRequest> {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(`/schools/${ID}/members${path}`);
    el = harness.fixture.nativeElement as HTMLElement;
    await stable();
    http.expectOne(SCHOOL).flush(school);
    http.expectOne(LOOKUP).flush({ items: [] });
    return roster();
  }

  /** The next roster request, once the lazy tab has sent it. */
  async function roster(): Promise<TestRequest> {
    let req!: TestRequest;
    await vi.waitFor(async () => {
      await stable();
      const found = http.match((r) => r.url === MEMBERS);
      expect(found).toHaveLength(1);
      req = found[0];
    });
    return req;
  }

  const text = (testId: string) =>
    el.querySelector(`[data-testid="${testId}"]`)?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
  /** Cells of each row, each cell's text squeezed. */
  const rows = () =>
    [...el.querySelectorAll('[data-testid="member-row"]')].map((row) =>
      [...row.children].map((td) => td.textContent!.replace(/\s+/g, ' ').trim()),
    );
  const url = () => TestBed.inject(Router).url;

  it('lists the roster with the owner on its own line, names from profiles only when missing', async () => {
    const req = await open();
    expect(req.request.params.keys().sort()).toEqual(['limit', 'page']);
    expect(req.request.params.get('limit')).toBe('50');
    req.flush(
      page([
        member(),
        member({ userId: 'u-2', name: null, role: 'teacher', rosterRole: 'TEACHER', groups: [] }),
        member({
          userId: 'u-3',
          name: 'Per',
          role: 'staff',
          rosterRole: 'MANAGER',
          status: 'archived',
          groups: [{ id: GROUP, name: 'NO-A2-2026', as: 'observer', isDefault: false }],
        }),
      ]),
    );
    await stable();
    const profiles = http.expectOne((r) => r.url === PROFILES);
    // Only the unsynced row is asked for.
    expect(profiles.request.params.get('userIds')).toBe('u-2');
    profiles.flush([{ userId: 'u-2', displayName: 'Ingrid Lærer' }]);
    await stable();

    expect(text('members-owner')).toContain('Kari Nordmann');
    expect(text('members-total')).toBe('Found: 3');
    const [ola, ingrid, per] = rows();
    expect(ola[0]).toBe('Ola Nordmann u-1');
    expect(ola.slice(1, 4)).toEqual(['Student', 'NO-A2-2026', 'On the roster']);
    expect(ingrid[0]).toBe('Ingrid Lærer u-2');
    expect(ingrid.slice(1, 3)).toEqual(['Teacher', '—']);
    expect(per.slice(1, 4)).toEqual(['Staff · Manager', 'NO-A2-2026 · observer', 'Archived']);
    // No email anywhere.
    expect(el.querySelector('[data-testid="school-members"]')!.textContent).not.toContain('@');
  });

  it('reads filters and page from the URL and hides the owner then', async () => {
    const req = await open(`?role=student&status=archived&group=${GROUP}&page=2&size=25`);
    expect(req.request.params.get('role')).toBe('student');
    expect(req.request.params.get('status')).toBe('archived');
    expect(req.request.params.get('groupId')).toBe(GROUP);
    expect(req.request.params.get('page')).toBe('2');
    expect(req.request.params.get('limit')).toBe('25');
    req.flush(page([member({ status: 'archived' })], 26, 2, 25));
    await stable();
    expect(el.querySelector('[data-testid="members-owner"]')).toBeNull();
    expect(rows()).toHaveLength(1);
  });

  it('filters by a group chip and resets back to the bare address', async () => {
    (await open()).flush(page([member()]));
    await stable();

    el.querySelector<HTMLButtonElement>('[data-testid="member-groups"] button')!.click();
    const filtered = await roster();
    expect(url()).toBe(`/schools/${ID}/members?group=${GROUP}`);
    expect(filtered.request.params.get('groupId')).toBe(GROUP);
    filtered.flush(page([]));
    await stable();
    expect(text('members-empty')).toContain('Nobody matches these filters.');

    el.querySelector<HTMLButtonElement>('[data-testid="members-reset"]')!.click();
    const all = await roster();
    expect(url()).toBe(`/schools/${ID}/members`);
    all.flush(page([member()]));
    await stable();
    expect(rows()).toHaveLength(1);
  });

  it('keeps the table when names fail, and retries the names alone', async () => {
    (await open()).flush(page([member({ name: null })]));
    await stable();
    http.expectOne((r) => r.url === PROFILES).flush({}, { status: 503, statusText: 'Error' });
    await stable();
    expect(rows()[0][0]).toBe('— u-1');
    expect(text('members-names-failed')).toContain('Could not load some names');

    el.querySelector<HTMLButtonElement>('[data-testid="members-names-failed"] button')!.click();
    await stable();
    http.expectOne((r) => r.url === PROFILES).flush([{ userId: 'u-1', displayName: 'Ola' }]);
    await stable();
    expect(rows()[0][0]).toBe('Ola u-1');
    expect(el.querySelector('[data-testid="members-names-failed"]')).toBeNull();
  });

  it('offers a retry when the roster fails; the card stays', async () => {
    (await open()).flush({}, { status: 500, statusText: 'Error' });
    await stable();
    expect(text('members-error')).toContain('Could not load the roster.');
    expect(text('page-title')).toBe('Nordick');

    el.querySelector<HTMLButtonElement>('[data-testid="members-error"] button')!.click();
    (await roster()).flush(page([]));
    await stable();
    expect(text('members-empty')).toBe('The roster is empty.');
    expect(text('members-owner')).toContain('Kari Nordmann');
  });

  it('leaves the hidden SOLO group out of chips and the group filter', async () => {
    const solo = detail({
      kind: 'SOLO',
      groups: [{ ...detail().groups[0], id: 'g-default', name: 'Default', isDefault: true }],
    });
    (await open('', solo)).flush(
      page([
        member({ groups: [{ id: 'g-default', name: 'Default', as: 'student', isDefault: true }] }),
      ]),
    );
    await stable();
    expect(rows()[0][2]).toBe('—');
    expect(el.querySelector('[data-testid="members-group"]')).toBeNull();
  });
});
