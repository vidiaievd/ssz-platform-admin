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
import { AdminSchoolListItemDto } from '../../api/organization/models/admin-school-list-item-dto';
import { AccountLookupItemDto } from '../../api/subscription/models/account-lookup-item-dto';
import { routes } from '../../app.routes';
import { provideApiClients } from '../../core/api/provide-api-clients';
import { SessionStore } from '../../core/auth/session.store';
import { adminToken, sessionBody, settle } from '../../core/auth/testing';
import { APP_CONFIG } from '../../core/config/app-config';
// Real English texts, so a missing key would show up as the key itself.
import en from '../../../../public/i18n/en.json';

const SCHOOLS = 'http://gw/api/v1/admin/schools';
const PROFILES = 'http://gw/api/v1/profiles';
const LOOKUP = 'http://gw/api/v1/admin/subscriptions/accounts/lookup';

function school(
  id: string,
  overrides: Partial<AdminSchoolListItemDto> = {},
): AdminSchoolListItemDto {
  return {
    id,
    name: `School ${id}`,
    slug: `school-${id}`,
    kind: 'SCHOOL',
    city: 'Oslo',
    status: 'active',
    closesAt: null,
    purgeAt: null,
    ownerId: `owner-${id}`,
    createdAt: '2026-03-05T10:00:00.000Z',
    counts: { students: 12, teachers: 3 },
    seats: { used: 12, limit: null },
    ...overrides,
  };
}

function account(
  externalId: string,
  overrides: Partial<AccountLookupItemDto> = {},
): AccountLookupItemDto {
  return {
    externalId,
    hasAccount: true,
    source: 'subscription',
    plan: { code: 'pro', name: 'Pro', version: 3 },
    subscription: {
      id: `sub-${externalId}`,
      status: 'active',
      periodStart: '2026-01-01',
      periodEnd: null,
    },
    activeGrants: 0,
    scheduledGrants: 0,
    seats: null,
    ...overrides,
  };
}

const serverError = { status: 500, statusText: 'Server Error' };
const notFound = { status: 404, statusText: 'Not Found' };

describe('SchoolsListPage', () => {
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

  /**
   * Lets the resources issue their requests and the view catch up. Not `whenStable()`: in a
   * zoneless app it also waits for unanswered HTTP requests, which a test answers afterwards.
   */
  async function stable(): Promise<void> {
    for (let i = 0; i < 3; i++) {
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

  const text = (selector: string) => el.querySelector(selector)?.textContent?.trim() ?? null;
  const all = (selector: string) =>
    Array.from(el.querySelectorAll(selector), (n) => n.textContent?.replace(/\s+/g, ' ').trim());
  const url = () => TestBed.inject(Router).url;

  function expectSchools(): TestRequest {
    return http.expectOne((r) => r.url === SCHOOLS);
  }

  /** Answers the page, then both extra columns (each callback may answer with an error). */
  async function answer(
    items: AdminSchoolListItemDto[],
    total = items.length,
    columns: { profiles?: (r: TestRequest) => void; lookup?: (r: TestRequest) => void } = {},
  ): Promise<void> {
    expectSchools().flush({ items, total, page: 1, limit: 25 });
    await stable();
    if (items.length === 0) return;
    const profiles = http.expectOne((r) => r.url === PROFILES);
    const lookup = http.expectOne(LOOKUP);
    (columns.profiles ?? ((r) => r.flush([])))(profiles);
    (columns.lookup ?? ((r) => r.flush({ items: [] })))(lookup);
    await stable();
  }

  it('sends the seats filter from the URL', async () => {
    await open('/schools?seats=near');
    expect(expectSchools().request.params.get('seats')).toBe('near');
  });

  it('writes the seats column: 87 / 100, a bare number without a limit', async () => {
    await open('/schools');
    await answer([
      school('a', { seats: { used: 87, limit: 100 } }),
      school('b', { seats: { used: 103, limit: 100 } }),
      school('c', { seats: { used: 7, limit: 5 } }),
      school('d', { seats: { used: 12, limit: null } }),
    ]);
    expect(all('[data-testid="school-seats"]')).toEqual(['87 / 100', '103 / 100', '7 / 5', '12']);
    const levels = Array.from(el.querySelectorAll('[data-testid="school-seats"]'), (n) =>
      n.getAttribute('data-level'),
    );
    expect(levels).toEqual(['ok', 'warning', 'full', 'none']);
  });

  it('asks organization for the page the URL describes', async () => {
    await open('/schools?q=oslo&kind=SOLO&status=active&sort=name&page=2&size=50');
    const req = expectSchools();
    expect(req.request.params.get('search')).toBe('oslo');
    expect(req.request.params.get('kind')).toBe('SOLO');
    expect(req.request.params.get('status')).toBe('active');
    expect(req.request.params.get('sort')).toBe('name');
    expect(req.request.params.get('page')).toBe('2');
    expect(req.request.params.get('limit')).toBe('50');
    req.flush({ items: [], total: 0, page: 2, limit: 50 });
    await stable();
    expect(el.querySelector('[data-testid="schools-search"]')).toHaveProperty('value', 'oslo');
  });

  it('shows a skeleton until the first page arrives', async () => {
    await open('/schools');
    expect(el.querySelector('[data-testid="schools-skeleton"]')).not.toBeNull();
    await answer([]);
    expect(el.querySelector('[data-testid="schools-skeleton"]')).toBeNull();
  });

  it('fills owners and plans for exactly the page, in one request each', async () => {
    await open('/schools');
    const a = school('a', { ownerId: 'u-1' });
    const b = school('b', { ownerId: 'u-1', kind: 'SOLO', status: 'closed', city: null });
    const c = school('c', { ownerId: 'u-2' });
    expectSchools().flush({ items: [a, b, c], total: 3, page: 1, limit: 25 });
    await stable();

    const profiles = http.expectOne((r) => r.url === PROFILES);
    expect(profiles.request.params.get('userIds')).toBe('u-1,u-2');
    const lookup = http.expectOne(LOOKUP);
    expect(lookup.request.body).toEqual({ type: 'workspace', ids: ['a', 'b', 'c'] });

    profiles.flush([{ userId: 'u-1', displayName: 'Kari Nordmann' }]);
    lookup.flush({
      items: [
        account('a'),
        account('b', {
          subscription: { id: 's', status: 'trial', periodStart: '2026-01-01', periodEnd: null },
        }),
        account('c', { plan: null, subscription: null, source: 'free_plan', hasAccount: false }),
      ],
    });
    await stable();

    expect(all('[data-testid="school-row"]')).toHaveLength(3);
    expect(all('[data-testid="school-owner"]')).toEqual(['Kari Nordmann', 'Kari Nordmann', '—']);
    const plans = all('[data-testid="school-plan"]');
    expect([plans[0], plans[2]]).toEqual(['Pro v3', '—']);
    expect(plans[1]).toMatch(/^Pro v3\s*trial$/);
    const rows = all('[data-testid="school-row"]');
    expect(rows[0]).toContain('school-a · Oslo');
    expect(rows[1]).toContain('Tutor');
    expect(rows[1]).toContain('Closed');
    // The owner of a SOLO workspace is its teacher but not on the roster: no misleading 0.
    expect(all('[data-testid="school-teachers"]')).toEqual(['3', '—', '3']);
    expect(text('[data-testid="schools-total"]')).toBe('Found: 3');
    expect(el.querySelector('[data-testid="schools-column-errors"]')).toBeNull();
  });

  it('keeps the table when an extra column fails, and retries that column alone', async () => {
    await open('/schools');
    await answer([school('a')], 1, {
      profiles: (r) => r.flush(null, serverError),
      lookup: (r) => r.flush({ items: [account('a')] }),
    });

    expect(all('[data-testid="school-row"]')).toHaveLength(1);
    expect(all('[data-testid="school-owner"]')).toEqual(['—']);
    expect(all('[data-testid="school-plan"]')).toEqual(['Pro v3']);
    expect(text('[data-testid="schools-column-errors"]')).toContain('Could not load owners');

    el.querySelector<HTMLButtonElement>('[data-testid="schools-column-errors"] button')!.click();
    await stable();
    http.expectOne((r) => r.url === PROFILES).flush([{ userId: 'owner-a', displayName: 'Ola' }]);
    await stable();
    expect(all('[data-testid="school-owner"]')).toEqual(['Ola']);
    expect(el.querySelector('[data-testid="schools-column-errors"]')).toBeNull();
  });

  it('shows an error with a retry when the page itself fails', async () => {
    await open('/schools');
    expectSchools().flush(null, serverError);
    await stable();
    expect(text('[data-testid="schools-error"]')).toContain('Could not load schools.');
    expect(el.querySelector('[data-testid="schools-skeleton"]')).toBeNull();

    el.querySelector<HTMLButtonElement>('[data-testid="schools-error"] button')!.click();
    await stable();
    await answer([school('a')]);
    expect(el.querySelector('[data-testid="schools-error"]')).toBeNull();
    expect(all('[data-testid="school-row"]')).toHaveLength(1);
  });

  it('tells a missing level apart from a broken service', async () => {
    await open('/schools');
    expectSchools().flush(
      { code: 'ADMIN_LEVEL_REQUIRED' },
      { status: 403, statusText: 'Forbidden' },
    );
    await stable();
    expect(text('[data-testid="schools-error"]')).toContain('No access to the schools list.');
  });

  it('writes the sort into the URL and starts again from page 1', async () => {
    await open('/schools?page=3');
    await answer([school('a')], 60);

    el.querySelector<HTMLButtonElement>('[data-testid="sort-name"]')!.click();
    await stable();
    expect(url()).toBe('/schools?sort=name');
    expect(el.querySelector('th:has([data-testid="sort-name"])')?.getAttribute('aria-sort')).toBe(
      'ascending',
    );
    const req = expectSchools();
    expect(req.request.params.get('sort')).toBe('name');
    expect(req.request.params.get('page')).toBe('1');
    req.flush({ items: [], total: 0, page: 1, limit: 25 });
    await stable();
  });

  it('keeps the old rows on screen while the next page loads', async () => {
    await open('/schools');
    await answer([school('a')], 60);
    el.querySelector<HTMLButtonElement>('[data-testid="sort-createdAt"]')!.click();
    await stable();
    expect(url()).toBe('/schools?sort=createdAt');
    expect(all('[data-testid="school-row"]')).toHaveLength(1);
    expect(all('[data-testid="school-owner"]')).toEqual(['—']); // still the old page's answer
    expectSchools().flush({ items: [], total: 0, page: 1, limit: 25 });
    await stable();
  });

  it('writes the search into the URL after a pause, replacing the history entry', async () => {
    await open('/schools?status=active&page=4');
    await answer([], 0);
    const input = el.querySelector<HTMLInputElement>('[data-testid="schools-search"]')!;
    input.value = 'berg';
    input.dispatchEvent(new Event('input'));
    input.value = 'bergen ';
    input.dispatchEvent(new Event('input'));
    await new Promise((resolve) => setTimeout(resolve, 350));
    await stable();

    expect(url()).toBe('/schools?q=bergen&status=active');
    // The trailing space the URL trimmed stays in the box while typing.
    expect(input.value).toBe('bergen ');
    expect(expectSchools().request.params.get('search')).toBe('bergen');
  });

  it('offers to reset filters when nothing matches', async () => {
    await open('/schools?kind=SOLO&sort=name');
    await answer([], 0);
    expect(text('[data-testid="schools-empty"]')).toContain('No schools match these filters.');

    el.querySelector<HTMLButtonElement>('[data-testid="schools-empty"] button')!.click();
    await stable();
    expect(url()).toBe('/schools?sort=name'); // sort and page size survive a reset
    expectSchools().flush({ items: [], total: 0, page: 1, limit: 25 });
    await stable();
    expect(text('[data-testid="schools-empty"]')).toBe('No schools yet.');
  });

  it('sends a page past the end back to the first one', async () => {
    await open('/schools?page=9');
    await answer([], 30);
    expect(text('[data-testid="schools-empty"]')).toContain('There are no schools on this page.');
    el.querySelector<HTMLButtonElement>('[data-testid="schools-empty"] button')!.click();
    await stable();
    expect(url()).toBe('/schools');
    expectSchools().flush({ items: [], total: 0, page: 1, limit: 25 });
    await stable();
  });

  it('opens the school card from a row', async () => {
    await open('/schools');
    await answer([school('a')]);
    el.querySelector<HTMLElement>('[data-testid="school-row"] td:nth-child(5)')!.click();
    // The card is a lazy chunk; it asks for the school and its plan once loaded.
    let card: TestRequest[] = [];
    await vi.waitFor(async () => {
      await stable();
      card = http.match(`${SCHOOLS}/a`);
      expect(card).toHaveLength(1);
    });
    expect(url()).toBe('/schools/a');
    card[0].flush({ statusCode: 404 }, notFound);
    http.expectOne(LOOKUP).flush({ items: [] });
    await stable();
    await stable();
    expect(text('[data-testid="school-not-found"]')).toContain('School not found');
  });
});
