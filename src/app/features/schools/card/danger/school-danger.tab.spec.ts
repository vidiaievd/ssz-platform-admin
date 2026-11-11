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
import { AdminSchoolDetailDto } from '../../../../api/organization/models/admin-school-detail-dto';
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
  activeGrants: 1,
  scheduledGrants: 0,
  seats: null,
};

const day = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

describe('SchoolDangerTab', () => {
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

  async function open(level: AdminLevel, overrides: Partial<AdminSchoolDetailDto>): Promise<void> {
    TestBed.inject(SessionStore).start(sessionBody(adminToken({ admin_level: level })));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(`/schools/${ID}/danger`);
    el = harness.fixture.nativeElement as HTMLElement;
    await stable();
    http.expectOne(SCHOOL).flush({ ...school, ...overrides });
    http.expectOne(LOOKUP).flush({ items: [lookup] });
    await stable();
  }

  const find = <T extends HTMLElement = HTMLElement>(testId: string, root: ParentNode = el) =>
    root.querySelector<T>(`[data-testid="${testId}"]`);
  const inPage = <T extends HTMLElement = HTMLElement>(testId: string) =>
    find<T>(testId, document.body);
  const text = (testId: string) => find(testId)?.textContent?.replace(/\s+/g, ' ').trim() ?? null;

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

  async function confirm(): Promise<void> {
    inPage<HTMLButtonElement>('reason-confirm')!.click();
    await stable();
  }

  it('shows the status, the dates and only the buttons of the viewer’s level', async () => {
    await open('admin', { status: 'suspended', closesAt: day(10) });
    expect(text('danger-status-tag')).toBe('Suspended');
    expect(text('danger-closes-at')).toMatch(/· (9|10) d left$/);
    // admin may reactivate; closing at once is super's — explained, not offered.
    expect(find('danger-open-reactivate')).not.toBeNull();
    expect(find('danger-open-close')).toBeNull();
    expect(text('danger-close')).toContain('Needs level super');
  });

  it('shows no button to support', async () => {
    await open('support', { status: 'active' });
    expect(el.querySelectorAll('[data-testid^="danger-open-"]')).toHaveLength(0);
    expect(el.querySelectorAll('[data-testid="danger-level-note"]')).toHaveLength(2);
  });

  it('has nothing to offer for a purged school', async () => {
    await open('super', { status: 'purged' });
    expect(find('danger-none')).not.toBeNull();
  });

  it('suspends with the reason and reads the school again', async () => {
    await open('admin', { status: 'active' });
    find<HTMLButtonElement>('danger-open-suspend')!.click();
    await dialogShown();
    await confirm();
    expect(http.match((r) => r.method === 'POST')).toHaveLength(0);

    await type('reason-input', 'Unpaid invoice');
    await confirm();
    const post = await next(`${SCHOOL}/suspend`, 'POST');
    expect(post.request.body).toEqual({ reason: 'Unpaid invoice' });
    post.flush({ id: ID, status: 'suspended', closesAt: day(30) });
    (await next(SCHOOL)).flush({ ...school, status: 'suspended', closesAt: day(30) });
    await stable();
    expect(text('danger-status-tag')).toBe('Suspended');
    expect(find('danger-open-reactivate')).not.toBeNull();
  });

  it('closes at once only after the school name is typed', async () => {
    await open('super', { status: 'active' });
    find<HTMLButtonElement>('danger-open-close')!.click();
    await dialogShown();

    await type('reason-input', 'Abuse');
    await type('danger-confirm-name', 'Wrong name');
    await confirm();
    expect(http.match((r) => r.method === 'POST')).toHaveLength(0);

    await type('danger-confirm-name', school.name);
    await confirm();
    const post = await next(`${SCHOOL}/close`, 'POST');
    expect(post.request.body).toEqual({ reason: 'Abuse' });
    post.flush({ id: ID, status: 'closed', purgeAt: day(183) });
    (await next(SCHOOL)).flush({ ...school, status: 'closed', purgeAt: day(183) });
    await stable();
    expect(text('danger-status-tag')).toBe('Closed');
    expect(find('danger-open-restore')).not.toBeNull();
    expect(find('danger-open-purge')).not.toBeNull();
  });

  it('says so inside the dialog when the status changed meanwhile', async () => {
    await open('admin', { status: 'active' });
    find<HTMLButtonElement>('danger-open-suspend')!.click();
    await dialogShown();
    await type('reason-input', 'Unpaid invoice');
    await confirm();
    (await next(`${SCHOOL}/suspend`, 'POST')).flush(
      { error: { code: 'SCHOOL_TRANSITION_NOT_ALLOWED' } },
      { status: 409, statusText: 'Conflict' },
    );
    await stable();
    expect(inPage('reason-error')).not.toBeNull();
  });
});
