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
import { SweepKindOverviewDto } from '../../../api/media/models/sweep-kind-overview-dto';
import { SweepRunSummaryDto } from '../../../api/media/models/sweep-run-summary-dto';
import { SweepsOverviewDto } from '../../../api/media/models/sweeps-overview-dto';
import { routes } from '../../../app.routes';
import { AdminLevel } from '../../../core/auth/admin-level';
import { provideApiClients } from '../../../core/api/provide-api-clients';
import { SessionStore } from '../../../core/auth/session.store';
import { adminToken, sessionBody, settle } from '../../../core/auth/testing';
import { APP_CONFIG } from '../../../core/config/app-config';
// Real English texts, so a missing key would show up as the key itself.
import en from '../../../../../public/i18n/en.json';

const OVERVIEW_URL = 'http://gw/api/v1/admin/media/sweeps';
const runUrl = (kind: string) => `http://gw/api/v1/admin/media/sweeps/${kind}/run`;

const SUMMARY: SweepRunSummaryDto = {
  scanned: 40,
  kept: 31,
  candidates: 9,
  deleted: 0,
  aborted: false,
  skipped: false,
};

function sweep(
  kind: SweepKindOverviewDto['kind'],
  patch: Partial<SweepKindOverviewDto> = {},
): SweepKindOverviewDto {
  return {
    kind,
    schedule: '30 3 * * *',
    nightlyMode: 'dry-run',
    minAgeDays: 7,
    ageBasis: 'created',
    maxPerRun: 5000,
    recentRuns: [],
    ...patch,
  };
}

const OVERVIEW: SweepsOverviewDto = {
  historyDays: 90,
  items: [
    sweep('orphan_recordings', {
      recentRuns: [
        {
          id: 'run-2',
          kind: 'orphan_recordings',
          mode: 'dry-run',
          trigger: 'nightly',
          actorId: null,
          startedAt: '2026-11-15T03:30:00Z',
          finishedAt: '2026-11-15T03:30:05Z',
          error: null,
          report: {},
          summary: { ...SUMMARY, aborted: true },
        },
        {
          id: 'run-1',
          kind: 'orphan_recordings',
          mode: 'delete',
          trigger: 'admin',
          actorId: 'admin-1',
          startedAt: '2026-11-14T10:00:00Z',
          finishedAt: '2026-11-14T10:00:09Z',
          error: null,
          report: {},
          summary: { ...SUMMARY, deleted: 9 },
        },
      ],
    }),
    sweep('superseded_narrations', {
      schedule: '45 3 * * *',
      ageBasis: 'superseded',
      minAgeDays: 30,
    }),
    sweep('abandoned_uploads', { schedule: '40 3 * * *', minAgeDays: 1 }),
    sweep('orphan_content', { schedule: '55 3 * * *' }),
  ],
};

describe('MediaSweepsPage', () => {
  let http: HttpTestingController;
  let el: HTMLElement;

  beforeEach(() => {
    localStorage.setItem('ssz-admin.lang', 'en');
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

  afterEach(() => {
    http.verify();
    localStorage.removeItem('ssz-admin.lang');
  });

  /** Not `whenStable()`: in a zoneless app it also waits for unanswered HTTP requests. */
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

  async function open(level: AdminLevel = 'super'): Promise<void> {
    TestBed.inject(SessionStore).start(sessionBody(adminToken({ admin_level: level })));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/platform/media');
    el = harness.fixture.nativeElement as HTMLElement;
  }

  async function openAnswered(level: AdminLevel = 'super'): Promise<void> {
    await open(level);
    (await next(OVERVIEW_URL)).flush(OVERVIEW);
    await stable();
  }

  const find = <T extends HTMLElement = HTMLElement>(testId: string, root: ParentNode = el) =>
    root.querySelector<T>(`[data-testid="${testId}"]`);
  const inPage = <T extends HTMLElement = HTMLElement>(testId: string) =>
    find<T>(testId, document.body);
  const textOf = (node: Element | null) => node?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
  const card = (kind: string) =>
    el.querySelector<HTMLElement>(`[data-testid="sweep-card"][data-kind="${kind}"]`)!;

  /** "Check now" on a card, answered with a dry run; the overview is read again after it. */
  async function check(kind: string, summary: SweepRunSummaryDto = SUMMARY): Promise<void> {
    find<HTMLButtonElement>('sweep-check', card(kind))!.click();
    const run = await next(runUrl(kind), 'POST');
    expect(run.request.body).toEqual({ dryRun: true });
    run.flush({ kind, mode: 'dry-run', report: {}, runId: 'run-3', summary });
    (await next(OVERVIEW_URL)).flush(OVERVIEW);
    await stable();
  }

  it('is the second tab of the Platform section', async () => {
    await openAnswered('support');
    expect(find('platform-tab-media')?.getAttribute('aria-current')).toBe('page');
  });

  it('shows the four sweeps, the nightly mode and the last runs', async () => {
    await openAnswered('support');

    const kinds = [...el.querySelectorAll('[data-testid="sweep-card"]')].map((c) =>
      c.getAttribute('data-kind'),
    );
    expect(kinds).toEqual([
      'orphan_recordings',
      'superseded_narrations',
      'abandoned_uploads',
      'orphan_content',
    ]);
    expect(textOf(find('media-nightly-mode'))).toBe('check only');
    expect(textOf(find('media-history-days'))).toContain('90 days');

    expect(textOf(find('sweep-schedule', card('orphan_recordings')))).toBe(
      'every night at 03:30, server time',
    );
    expect(textOf(find('sweep-min-age', card('superseded_narrations')))).toBe(
      '30 d after replacement',
    );
    expect(textOf(find('sweep-owner', card('abandoned_uploads')))).toContain('nobody');

    const runs = card('orphan_recordings').querySelectorAll('[data-testid="sweep-run"]');
    expect(runs).toHaveLength(2);
    expect(runs[0].getAttribute('data-outcome')).toBe('aborted');
    expect(textOf(find('run-outcome', runs[0]))).toBe('Stopped: exercise engine did not answer');
    expect(textOf(find('run-deleted', runs[1]))).toBe('9');
    expect(find('sweep-no-runs', card('orphan_content'))).not.toBeNull();

    // `support` reads only.
    expect(el.querySelectorAll('[data-testid="sweep-check"]')).toHaveLength(0);
    expect(el.querySelectorAll('[data-testid="sweep-delete-blocked"]')).toHaveLength(0);
  });

  it('lets admin check but never delete', async () => {
    await openAnswered('admin');
    await check('orphan_recordings');

    expect(textOf(find('sweep-dry-run', card('orphan_recordings')))).toContain(
      '40 looked at, 31 still in use, 9 would be deleted.',
    );
    expect(find('sweep-delete', card('orphan_recordings'))).toBeNull();
    expect(find('sweep-delete-blocked', card('orphan_recordings'))).toBeNull();
  });

  it('opens delete for super only after a fresh check, with its numbers and a reason', async () => {
    await openAnswered();
    expect(find('sweep-delete', card('orphan_content'))).toBeNull();
    expect(textOf(find('sweep-delete-blocked', card('orphan_content')))).toContain(
      'after a check from this panel',
    );

    await check('orphan_content');
    find<HTMLButtonElement>('sweep-delete', card('orphan_content'))!.click();
    await vi.waitFor(async () => {
      await stable();
      expect(inPage('sweep-delete-candidates')?.isConnected).toBe(true);
    });
    expect(textOf(inPage('sweep-delete-kind'))).toBe('Orphan content files');
    expect(textOf(inPage('sweep-delete-candidates'))).toBe('9');

    // No reason — nothing is sent.
    inPage<HTMLButtonElement>('reason-confirm')!.click();
    await stable();
    expect(http.match((r) => r.method === 'POST')).toHaveLength(0);

    const reason = inPage<HTMLTextAreaElement>('reason-input')!;
    reason.value = 'storage clean-up';
    reason.dispatchEvent(new Event('input'));
    await stable();
    inPage<HTMLButtonElement>('reason-confirm')!.click();

    const del = await next(runUrl('orphan_content'), 'POST');
    expect(del.request.body).toEqual({ dryRun: false, reason: 'storage clean-up' });
    del.flush({
      kind: 'orphan_content',
      mode: 'delete',
      report: {},
      runId: 'run-4',
      summary: { ...SUMMARY, deleted: 8 },
    });
    (await next(OVERVIEW_URL)).flush(OVERVIEW);
    await stable();

    expect(textOf(find('sweep-deleted', card('orphan_content')))).toBe('Deleted 8 files.');
    // The check is used up: the next delete needs a new one.
    expect(find('sweep-delete', card('orphan_content'))).toBeNull();
  });

  it('does not offer delete when the check found nothing or stopped', async () => {
    await openAnswered();
    await check('abandoned_uploads', { ...SUMMARY, candidates: 0 });
    expect(find('sweep-delete', card('abandoned_uploads'))).toBeNull();
    expect(textOf(find('sweep-delete-blocked', card('abandoned_uploads')))).toBe(
      'Nothing to delete.',
    );

    await check('superseded_narrations', { ...SUMMARY, aborted: true });
    expect(find('sweep-delete', card('superseded_narrations'))).toBeNull();
    expect(textOf(find('sweep-dry-run-aborted', card('superseded_narrations')))).toBe(
      'Stopped: content service did not answer',
    );
  });

  it('says a run is going when the sweep is busy', async () => {
    await openAnswered('admin');
    find<HTMLButtonElement>('sweep-check', card('orphan_recordings'))!.click();
    (await next(runUrl('orphan_recordings'), 'POST')).flush(
      { code: 'SWEEP_RUNNING' },
      { status: 409, statusText: 'Conflict' },
    );
    await stable();
    expect(textOf(find('sweep-check-error', card('orphan_recordings')))).toContain(
      'going on right now',
    );
    expect(find('sweep-dry-run', card('orphan_recordings'))).toBeNull();
  });

  it('offers a retry when the read fails', async () => {
    await open();
    (await next(OVERVIEW_URL)).flush(null, { status: 503, statusText: 'Unavailable' });
    await stable();
    expect(find('media-failed')).not.toBeNull();

    find<HTMLButtonElement>('media-failed')!.querySelector('button')!.click();
    (await next(OVERVIEW_URL)).flush(OVERVIEW);
    await stable();
    expect(el.querySelectorAll('[data-testid="sweep-card"]')).toHaveLength(4);
  });
});
