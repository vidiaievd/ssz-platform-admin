import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { AdminSchoolListItemDto } from '../../api/organization/models/admin-school-list-item-dto';
import { routes } from '../../app.routes';
import { provideApiClients } from '../../core/api/provide-api-clients';
import { SessionStore } from '../../core/auth/session.store';
import { adminToken, sessionBody, settle } from '../../core/auth/testing';
import { APP_CONFIG } from '../../core/config/app-config';
import { PALETTE_SEARCH_DELAY_MS } from './school-search';
// Real English texts, so a missing key would show up as the key itself.
import en from '../../../../public/i18n/en.json';

const SCHOOLS = 'http://gw/api/v1/admin/schools';

function school(
  id: string,
  overrides: Partial<AdminSchoolListItemDto> = {},
): AdminSchoolListItemDto {
  return {
    id,
    name: `Nord ${id}`,
    slug: `nord-${id}`,
    kind: 'SCHOOL',
    city: null,
    status: 'active',
    ownerId: `owner-${id}`,
    createdAt: '2026-03-05T10:00:00.000Z',
    counts: { students: 1, teachers: 1 },
    ...overrides,
  };
}

describe('CommandPalette', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
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
        { provide: PALETTE_SEARCH_DELAY_MS, useValue: 0 },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(SessionStore).start(sessionBody(adminToken({ admin_level: 'support' })));
    const harness = await RouterTestingHarness.create();
    // A section without data of its own, so the only requests are the palette's.
    await harness.navigateByUrl('/users');
    await stable();
  });

  afterEach(() => http.verify());

  /** Not `whenStable()`: in a zoneless app it also waits for unanswered HTTP requests. */
  async function stable(): Promise<void> {
    for (let i = 0; i < 4; i++) {
      await settle();
      TestBed.tick();
    }
  }

  const body = () => document.body;
  const input = () => body().querySelector<HTMLInputElement>('[data-testid="palette-input"]');
  const options = () =>
    Array.from(body().querySelectorAll<HTMLElement>('[data-testid="palette-option"]'));
  // Each visible part of a row on its own, so "name · slug" and the kind do not run together.
  const labels = () =>
    options().map((o) =>
      Array.from(o.children, (c) => c.textContent?.replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .join(' '),
    );
  const active = () => options().find((o) => o.getAttribute('aria-selected') === 'true');
  const text = (testId: string) =>
    body().querySelector(`[data-testid="${testId}"]`)?.textContent?.trim() ?? null;
  const url = () => TestBed.inject(Router).url;

  async function hotkey(
    init: KeyboardEventInit = { key: 'k', ctrlKey: true },
  ): Promise<KeyboardEvent> {
    const event = new KeyboardEvent('keydown', { ...init, bubbles: true, cancelable: true });
    document.dispatchEvent(event);
    await stable();
    return event;
  }

  async function type(value: string): Promise<void> {
    const field = input()!;
    field.value = value;
    field.dispatchEvent(new Event('input'));
    await stable();
  }

  async function press(key: string): Promise<void> {
    input()!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    await stable();
  }

  it('opens on Ctrl+K, keeps the browser from taking the key, and lists every section', async () => {
    expect(input()).toBeNull();
    const event = await hotkey();
    expect(event.defaultPrevented).toBe(true);
    expect(input()).not.toBeNull();
    // Typing goes straight into the field.
    await vi.waitFor(() => expect(document.activeElement).toBe(input()));
    expect(labels()).toEqual([
      'Overview',
      'Schools',
      'Users',
      'Plans',
      'AI',
      'Platform',
      'Audit log',
      'Payments',
    ]);
    expect(active()?.textContent?.trim()).toBe('Overview');
    expect(input()!.getAttribute('aria-activedescendant')).toBe('palette-section-dashboard');
    expect(text('palette-hint')).toBe("Type a section, or a school's name or slug.");
  });

  it('opens from the header button too', async () => {
    body().querySelector<HTMLButtonElement>('[data-testid="palette-trigger"]')!.click();
    await stable();
    expect(input()).not.toBeNull();
  });

  it('filters sections locally and does not search schools for one letter', async () => {
    await hotkey();
    await type('a');
    expect(labels()).toEqual(['AI', 'Audit log', 'Overview', 'Plans', 'Platform', 'Payments']);
    expect(text('palette-hint')).toBe('Type at least 2 characters to find a school.');
    http.expectNone((r) => r.url === SCHOOLS);
  });

  it('finds schools by the term, eight at most, and offers the rest in the list', async () => {
    await hotkey();
    await type(' nord ');
    expect(text('palette-searching')).toBe('Searching…');

    const req = http.expectOne((r) => r.url === SCHOOLS);
    expect(req.request.params.get('search')).toBe('nord');
    expect(req.request.params.get('limit')).toBe('8');
    req.flush({
      items: [school('a'), school('b', { status: 'deleted', kind: 'SOLO' })],
      total: 14,
      page: 1,
      limit: 8,
    });
    await stable();

    expect(labels()).toEqual([
      'Nord a · nord-a School',
      'Nord b · nord-b Tutor Deleted',
      'All 14 results in the schools list',
    ]);
  });

  it('walks with the arrows round the list and opens the school on Enter', async () => {
    await hotkey();
    await type('nord');
    http
      .expectOne((r) => r.url === SCHOOLS)
      .flush({ items: [school('a'), school('b')], total: 2, page: 1, limit: 8 });
    await stable();
    expect(labels()).toEqual(['Nord a · nord-a School', 'Nord b · nord-b School']);

    await press('ArrowDown');
    expect(active()?.getAttribute('data-option')).toBe('palette-school-b');
    await press('ArrowDown');
    expect(active()?.getAttribute('data-option')).toBe('palette-school-a');
    await press('ArrowUp');
    await press('Enter');

    // The schools section is a lazy chunk: the navigation ends a little later.
    await vi.waitFor(() => expect(url()).toBe('/schools/b'));
    expect(input()).toBeNull();
  });

  it('opens a section on Enter and starts empty next time', async () => {
    await hotkey();
    await type('plat');
    await press('Enter');
    expect(url()).toBe('/platform');
    // Closing dropped the school search that "plat" had started.
    expect(http.expectOne((r) => r.url === SCHOOLS).cancelled).toBe(true);

    await hotkey();
    expect(input()!.value).toBe('');
    expect(labels()).toHaveLength(8);
  });

  it('opens the schools list with the same search from "all results"', async () => {
    await hotkey();
    await type('nord');
    http
      .expectOne((r) => r.url === SCHOOLS)
      .flush({ items: [school('a')], total: 30, page: 1, limit: 8 });
    await stable();
    options().at(-1)!.click();
    await stable();

    await vi.waitFor(() => expect(url()).toBe('/schools?q=nord'));
    await stable();
    // The list page asks for its own data; that is its spec's business.
    http.match(() => true);
  });

  it('cancels the previous search when the term changes', async () => {
    await hotkey();
    await type('no');
    const first = http.expectOne((r) => r.url === SCHOOLS);
    await type('nor');
    expect(first.cancelled).toBe(true);
    http
      .expectOne((r) => r.params.get('search') === 'nor')
      .flush({
        items: [],
        total: 0,
        page: 1,
        limit: 8,
      });
    await stable();
    expect(text('palette-no-schools')).toBe('No schools found.');
  });

  it('keeps sections working when the school search fails, and retries', async () => {
    await hotkey();
    await type('ai');
    http
      .expectOne((r) => r.url === SCHOOLS)
      .flush(null, { status: 500, statusText: 'Server Error' });
    await stable();
    expect(text('palette-error')).toBe('Could not search schools.');
    expect(labels()).toEqual(['AI']);

    body().querySelector<HTMLButtonElement>('[data-testid="palette-retry"]')!.click();
    await stable();
    http.expectOne((r) => r.url === SCHOOLS).flush({ items: [], total: 0, page: 1, limit: 8 });
    await stable();
    expect(text('palette-no-schools')).toBe('No schools found.');
  });

  it('closes on a second Ctrl+K', async () => {
    await hotkey();
    expect(input()).not.toBeNull();
    await hotkey({ key: 'K', metaKey: true });
    expect(input()).toBeNull();
  });
});
