import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { AdminSchoolDetailDto } from '../../../api/organization/models/admin-school-detail-dto';
import { AdminSchoolGroupDto } from '../../../api/organization/models/admin-school-group-dto';
import { routes } from '../../../app.routes';
import { provideApiClients } from '../../../core/api/provide-api-clients';
import { SessionStore } from '../../../core/auth/session.store';
import { adminToken, sessionBody, settle } from '../../../core/auth/testing';
import { APP_CONFIG } from '../../../core/config/app-config';
import { MAX_COURSE_READS } from './school-courses.data';
// Real English texts, so a missing key would show up as the key itself.
import en from '../../../../../public/i18n/en.json';

const ID = '7d3c1b2a-0000-4000-8000-000000000001';
const SCHOOL = `http://gw/api/v1/admin/schools/${ID}`;
const LOOKUP = 'http://gw/api/v1/admin/subscriptions/accounts/lookup';
const COURSE_A = 'c0000000-0000-4000-8000-00000000000a';
const COURSE_B = 'c0000000-0000-4000-8000-00000000000b';
const course = (id: string) => `http://gw/api/v1/containers/${id}`;

function group(overrides: Partial<AdminSchoolGroupDto> = {}): AdminSchoolGroupDto {
  return {
    id: 'g-1',
    name: 'NO-A2-2026',
    level: 'A2',
    status: 'active',
    students: 6,
    courseId: COURSE_A,
    isDefault: false,
    ...overrides,
  };
}

function detail(overrides: Partial<AdminSchoolDetailDto> = {}): AdminSchoolDetailDto {
  return {
    id: ID,
    name: 'Nordick',
    slug: 'nordick',
    kind: 'SCHOOL',
    type: 'HYBRID',
    status: 'active',
    description: 'Norsk for voksne',
    avatarUrl: null,
    createdAt: '2026-03-05T10:00:00.000Z',
    updatedAt: '2026-04-01T10:00:00.000Z',
    deletedAt: null,
    contacts: { email: 'post@nordick.no', website: 'nordick.no', city: 'Oslo' },
    owner: { userId: 'owner-1', name: 'Kari Nordmann', email: 'kari@nordick.no' },
    counts: {
      students: 7,
      archivedStudents: 2,
      teachers: 6,
      staff: 1,
      pendingApplications: 3,
      pendingInvitations: 4,
    },
    groups: [group(), group({ id: 'g-2', name: 'Spare', courseId: null, status: 'draft' })],
    courses: { count: 2, ids: [COURSE_A, COURSE_B] },
    ...overrides,
  };
}

function container(id: string, title: string, extra: Record<string, unknown> = {}) {
  return { id, title, difficultyLevel: 'A2', localizations: [], ...extra };
}

describe('SchoolOverviewTab', () => {
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

  /** Opens the card on the overview and answers the school and its plan. */
  async function open(school: AdminSchoolDetailDto = detail()): Promise<void> {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(`/schools/${ID}`);
    el = harness.fixture.nativeElement as HTMLElement;
    await stable();
    http.expectOne(SCHOOL).flush(school);
    http.expectOne(LOOKUP).flush({ items: [] });
    // The tab is lazy: wait until it is on screen.
    await vi.waitFor(async () => {
      await stable();
      expect(el.querySelector('[data-testid="school-overview"]')).not.toBeNull();
    });
  }

  const text = (testId: string) =>
    el.querySelector(`[data-testid="${testId}"]`)?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
  /** Each match as its children's texts joined by a space (cells of a row, parts of a line). */
  const texts = (testId: string) =>
    [...el.querySelectorAll(`[data-testid="${testId}"]`)].map((node) =>
      [...node.children]
        .map((child) => child.textContent!.replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .join(' '),
    );

  it('shows details, contacts, owner and people counts', async () => {
    await open();
    http.expectOne(course(COURSE_A)).flush(container(COURSE_A, 'Ny i Norge A2'));
    http.expectOne(course(COURSE_B)).flush(container(COURSE_B, 'Uttale'));
    await stable();

    expect(text('overview-description')).toBe('Norsk for voksne');
    expect(text('overview-format')).toBe('Hybrid');
    expect(text('contact-email')).toBe('post@nordick.no');
    expect(el.querySelector('[data-testid="contact-website"] a')?.getAttribute('href')).toBe(
      'https://nordick.no',
    );
    expect(text('contact-city')).toBe('Oslo');
    expect(text('owner-name')).toBe('Kari Nordmann');
    expect(text('owner-email')).toBe('kari@nordick.no');
    expect(text('count-students')).toBe('Students 7');
    expect(text('count-archivedStudents')).toBe('Archived students 2');
    expect(text('count-teachers')).toBe('Teachers 6');
    expect(text('count-pendingInvitations')).toBe('Pending invitations 4');
  });

  it('lists groups and courses with titles from content', async () => {
    await open();
    http
      .expectOne(course(COURSE_A))
      .flush(container(COURSE_A, 'Ny i Norge A2', { archivedAt: '2026-10-01T00:00:00Z' }));
    http.expectOne(course(COURSE_B)).flush({}, { status: 404, statusText: 'Not Found' });
    await stable();

    const rows = texts('group-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toBe('NO-A2-2026 A2 Active 6 Ny i Norge A2');
    expect(rows[1]).toBe('Spare A2 Draft 6 —');

    const courses = texts('course-row');
    expect(courses[0]).toBe(`Ny i Norge A2 A2 archived ${COURSE_A}`);
    // Content does not know the second course: said so, the id stays.
    expect(courses[1]).toBe(`Not found in content ${COURSE_B}`);
    expect(el.querySelector('[data-testid="courses-failed"]')).toBeNull();
  });

  it('keeps the ids and offers a retry when content fails', async () => {
    await open();
    http.expectOne(course(COURSE_A)).flush({}, { status: 503, statusText: 'Unavailable' });
    // forkJoin drops the other request once one fails.
    const other = http.match(course(COURSE_B));
    other.forEach((r) => expect(r.cancelled).toBe(true));
    await stable();

    expect(text('courses-failed')).toContain('Could not load course titles.');
    expect(texts('course-row')).toEqual([COURSE_A, COURSE_B]);
    expect(text('group-course')).toBe(COURSE_A.slice(0, 8));
    // The rest of the card stays.
    expect(text('owner-name')).toBe('Kari Nordmann');

    el.querySelector<HTMLButtonElement>('[data-testid="courses-retry"]')!.click();
    await stable();
    http.expectOne(course(COURSE_A)).flush(container(COURSE_A, 'Ny i Norge A2'));
    http.expectOne(course(COURSE_B)).flush(container(COURSE_B, 'Uttale'));
    await stable();
    expect(el.querySelector('[data-testid="courses-failed"]')).toBeNull();
    expect(texts('course-row')[1]).toBe(`Uttale A2 ${COURSE_B}`);
  });

  it('asks content nothing without courses, and says what is empty', async () => {
    await open(
      detail({
        description: null,
        contacts: { email: null, website: null, city: null },
        owner: { userId: 'owner-1', name: null, email: null },
        groups: [],
        courses: { count: 0, ids: [] },
      }),
    );
    expect(el.querySelector('[data-testid="overview-description"]')).toBeNull();
    expect(text('contacts-empty')).toBe('The school has given no contacts.');
    expect(text('owner-name')).toBe('Name unavailable');
    expect(text('groups-empty')).toBe('The school has no groups.');
    expect(text('courses-empty')).toBe('No group of the school uses a course.');
  });

  it('shows "—" for teachers and staff of a tutor workspace and marks its hidden group', async () => {
    await open(
      detail({
        kind: 'SOLO',
        groups: [group({ isDefault: true, name: 'Default', courseId: null })],
        courses: { count: 0, ids: [] },
      }),
    );
    expect(text('count-teachers')).toBe('Teachers —');
    expect(text('count-staff')).toBe('Staff —');
    expect(text('count-students')).toBe('Students 7');
    expect(text('group-default')).toBe('all learners, hidden');
  });

  it('shows a website that is not a plain domain as text, not a link', async () => {
    await open(
      detail({
        contacts: { email: null, website: 'javascript:alert(1)', city: null },
        courses: { count: 0, ids: [] },
        groups: [],
      }),
    );
    expect(text('contact-website')).toBe('javascript:alert(1)');
    expect(el.querySelector('[data-testid="contact-website"] a')).toBeNull();
  });

  it(`reads at most ${MAX_COURSE_READS} courses`, async () => {
    const ids = Array.from(
      { length: MAX_COURSE_READS + 2 },
      (_, i) => `c0000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    );
    await open(detail({ groups: [], courses: { count: ids.length, ids } }));
    const requests = http.match((r) => r.url.startsWith('http://gw/api/v1/containers/'));
    expect(requests).toHaveLength(MAX_COURSE_READS);
    requests.forEach((r, i) => r.flush(container(ids[i], `Course ${i}`)));
    await stable();
    const rows = texts('course-row');
    expect(rows).toHaveLength(ids.length);
    // Over the cap: the id alone, not "not found".
    expect(rows.at(-1)).toBe(ids.at(-1));
  });
});
