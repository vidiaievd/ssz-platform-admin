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
import { routes } from '../../../app.routes';
import { AdminLevel } from '../../../core/auth/admin-level';
import { provideApiClients } from '../../../core/api/provide-api-clients';
import { SessionStore } from '../../../core/auth/session.store';
import { adminToken, sessionBody, settle } from '../../../core/auth/testing';
import { APP_CONFIG } from '../../../core/config/app-config';
import { EVAL_POLL_MS } from './ai-evals.data';
import {
  HAIKU_ID,
  RUN_A,
  RUN_B,
  RUN_C,
  SONNET_ID,
  assistRun,
  assistRuns,
  assistSummary,
  evalModels,
  evalProviders,
  reviewRun,
  reviewRuns,
  reviewScores,
  reviewSummary,
  voiceRuns,
  voiceScores,
  voiceSummary,
} from './eval-fixtures';
// Real English texts, so a missing key would show up as the key itself.
import en from '../../../../../public/i18n/en.json';

const AI = 'http://gw/api/v1/admin/ai';
const MODELS = `${AI}/models`;
const PROVIDERS = `${AI}/providers`;
const runsOf = (set: string) => `${AI}/evals/${set}/runs`;
const runOf = (set: string, id: string) => `${AI}/evals/${set}/runs/${id}`;
const startOf = (set: string) => `${AI}/evals/${set}/run`;

describe('AiEvalsPage', () => {
  let http: HttpTestingController;
  let el: HTMLElement;
  let router: Router;

  beforeEach(() => {
    // jsdom has no matchMedia; PrimeNG's select overlay asks it whether to open as a modal.
    window.matchMedia ??= ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    })) as typeof window.matchMedia;
    // jsdom has no scrollIntoView; PrimeNG's select scrolls to the chosen option.
    Element.prototype.scrollIntoView ??= () => undefined;
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
        // Short, so the polling test does not wait seconds.
        { provide: EVAL_POLL_MS, useValue: 30 },
        provideApiClients(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
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

  async function open(
    url = '/ai/evals',
    level: AdminLevel = 'admin',
    runs: object = reviewRuns([
      reviewSummary(RUN_A),
      reviewSummary(RUN_B, {
        modelId: HAIKU_ID,
        matchesBinding: 'fallback',
        startedAt: '2026-11-13T10:00:00.000Z',
        skipped: {},
        scores: reviewScores({ confirmedRecall: 0.8, remarkPrecision: 0.5 }),
      }),
    ]),
  ): Promise<void> {
    TestBed.inject(SessionStore).start(sessionBody(adminToken({ admin_level: level })));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    el = harness.fixture.nativeElement as HTMLElement;
    const set = new URL(`http://x${url}`).searchParams.get('set') ?? 'review_draft';
    const list = await next(runsOf(set));
    expect(list.request.params.get('limit')).toBe('50');
    list.flush(runs);
    (await next(MODELS)).flush(evalModels);
    (await next(PROVIDERS)).flush(evalProviders);
    await stable();
  }

  const find = <T extends HTMLElement = HTMLElement>(testId: string, root: ParentNode = el) =>
    root.querySelector<T>(`[data-testid="${testId}"]`);
  const all = (testId: string, root: ParentNode = el) => [
    ...root.querySelectorAll<HTMLElement>(`[data-testid="${testId}"]`),
  ];
  const inPage = <T extends HTMLElement = HTMLElement>(testId: string) =>
    find<T>(testId, document.body);
  const textOf = (node: Element | null) => node?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
  const runRow = (id: string) =>
    el.querySelector<HTMLElement>(`[data-testid="eval-run-row"][data-run="${id}"]`)!;
  const metric = (root: ParentNode, key: string) =>
    root.querySelector<HTMLElement>(`[data-metric="${key}"]`)!;

  async function dialogShown(): Promise<void> {
    await vi.waitFor(async () => {
      await stable();
      expect(inPage('eval-run-dialog')?.isConnected).toBe(true);
    });
  }

  async function type(testId: string, value: string): Promise<void> {
    const field = inPage<HTMLInputElement>(testId)!;
    field.value = value;
    field.dispatchEvent(new Event('input'));
    await stable();
  }

  let currentList: Element | null = null;
  const optionsOf = (list: Element | null) =>
    list ? [...list.querySelectorAll<HTMLElement>('[role="option"]')] : [];

  /** The select's own list, found through its `aria-controls` (see agent-bindings.page.spec). */
  async function openSelect(testId: string): Promise<HTMLElement[]> {
    const select = inPage(testId)!;
    select.click();
    await vi.waitFor(async () => {
      await stable();
      const listId = select.querySelector('[aria-controls]')?.getAttribute('aria-controls');
      const lists = listId ? document.body.querySelectorAll(`[id="${listId}"]`) : [];
      currentList = lists[lists.length - 1] ?? null;
      expect(optionsOf(currentList).length).toBeGreaterThan(0);
    });
    return optionsOf(currentList);
  }

  it('is a tab of the AI section: the binding today and the runs side by side', async () => {
    await open();
    expect(router.url).toBe('/ai/evals');
    expect(find('ai-tab-evals')?.getAttribute('aria-current')).toBe('page');
    expect(find('eval-set-review_draft')?.getAttribute('aria-current')).toBe('page');

    expect(textOf(find('eval-bindings'))).toBe('review_draft today: Sonnet → Haiku review_draft@3');

    expect(all('eval-run-row')).toHaveLength(2);
    const a = runRow(RUN_A);
    expect(textOf(a)).toContain('Sonnet');
    expect(textOf(a)).toContain('bound now');
    expect(textOf(find('eval-run-cases', a))).toBe('40 +3 left out');
    expect(textOf(metric(a, 'confirmedRecall'))).toBe('72.0%');
    expect(textOf(find('eval-run-cost', a))).toBe('$1.25');
    expect(textOf(runRow(RUN_B))).toContain('fallback now');

    // The best of each column is bold: recall — B, precision — A.
    expect(metric(runRow(RUN_B), 'confirmedRecall').classList).toContain('font-semibold');
    expect(metric(a, 'confirmedRecall').classList).not.toContain('font-semibold');
    expect(metric(a, 'remarkPrecision').classList).toContain('font-semibold');
  });

  it('opens a run as a card from the table and closes it again', async () => {
    await open();
    runRow(RUN_A).click();
    await stable();
    expect(router.url).toBe(`/ai/evals?run=${RUN_A}`);
    (await next(runOf('review_draft', RUN_A))).flush(reviewRun(RUN_A));
    await stable();

    const card = find('eval-run-card')!;
    expect(textOf(find('eval-card-model', card))).toBe('Sonnet');
    expect(textOf(find('eval-card-duration', card))).toBe('4 min 30 s');
    expect(textOf(find('eval-card-cost', card))).toBe('$1.25 · 125.000000 credits');
    expect(textOf(find('eval-card-skipped', card))).toBe(
      'Drafts left out: 3 — NO_KEY 2, TEXT_GONE 1',
    );
    expect(textOf(metric(find('eval-card-scores', card)!, 'markBias'))).toBe('+0.25');

    const cases = all('eval-case', card);
    expect(cases).toHaveLength(2);
    expect(textOf(cases[0])).toContain('2 / 3');
    expect(textOf(cases[1])).toContain('failed · TIMEOUT');
    expect(runRow(RUN_A).getAttribute('aria-selected')).toBe('true');

    find<HTMLButtonElement>('eval-card-close', card)!.click();
    await stable();
    expect(router.url).toBe('/ai/evals');
    expect(find('eval-run-card')).toBeNull();
  });

  it('switches to the voice set: both voice agents, the gate per run', async () => {
    await open(
      '/ai/evals?set=voice_review',
      'support',
      voiceRuns([
        voiceSummary(RUN_A),
        voiceSummary(RUN_B, {
          capability: 'voice_review_pronunciation',
          scores: voiceScores({ gate: { met: false, minPrompts: 100, minAgreement: 0.85 } }),
        }),
      ]),
    );
    expect(find('eval-set-voice_review')?.getAttribute('aria-current')).toBe('page');
    const bindings = textOf(find('eval-bindings'));
    expect(bindings).toContain('voice_review today: Azure Speech');
    expect(bindings).toContain('voice_review_pronunciation today: not bound');

    expect(textOf(find('eval-run-gate', runRow(RUN_A)))).toBe('gate met');
    expect(textOf(find('eval-run-gate', runRow(RUN_B)))).toBe('gate not met');
    expect(textOf(runRow(RUN_B))).toContain('voice_review_pronunciation');
    expect(textOf(find('eval-run-cost', runRow(RUN_A)))).toBe('—');
    // Reading only: no run for support.
    expect(find('eval-new-run')).toBeNull();

    // Another set: its own list, the opened run is dropped.
    find<HTMLAnchorElement>('eval-set-student_assist')!.click();
    await stable();
    expect(router.url).toBe('/ai/evals?set=student_assist');
    (await next(runsOf('student_assist'))).flush(assistRuns([assistSummary(RUN_C)]));
    await stable();
    expect(textOf(find('eval-bindings'))).toBe('student_assist today: not bound');
    expect(textOf(metric(runRow(RUN_C), 'leakRate'))).toBe('0.0%');
  });

  it('shows the assistant case by case: a leaked answer, the silences by cause', async () => {
    await open(
      `/ai/evals?set=student_assist&run=${RUN_C}`,
      'support',
      assistRuns([assistSummary(RUN_C)]),
    );
    (await next(runOf('student_assist', RUN_C))).flush(assistRun(RUN_C));
    await stable();

    const card = find('eval-run-card')!;
    // A zero count is not a reason worth showing.
    expect(find('eval-card-skipped', card)).toBeNull();
    const causes = find('eval-card-silent-causes', card)!;
    expect([...causes.querySelectorAll('dt')].map(textOf)).toEqual(['BUDGET', 'VERIFIER']);
    expect([...causes.querySelectorAll('dd')].map(textOf)).toEqual(['1', '1']);
    const verdicts = all('eval-case-verdict', card).map(textOf);
    expect(verdicts).toEqual(['cited as expected', 'leaked the answer']);
  });

  it('starts a run (admin): the bound model first, the run opens and is read until it ends', async () => {
    await open();
    find<HTMLButtonElement>('eval-new-run')!.click();
    await dialogShown();

    const options = await openSelect('eval-run-model');
    const gpt = options.find((o) => o.textContent!.includes('GPT'))!;
    expect(textOf(gpt)).toContain('The provider has no key');
    expect(gpt.getAttribute('data-p-disabled')).toBe('true');
    expect(textOf(options.find((o) => o.textContent!.includes('Plain'))!)).toContain(
      'Lacks: structuredOutput json_mode (has none)',
    );
    // Close the list again; the bound primary is already picked.
    inPage('eval-run-model')!.click();
    await stable();
    expect(textOf(inPage('eval-run-model'))).toContain('Sonnet');
    expect(inPage<HTMLInputElement>('eval-run-prompt')!.placeholder).toBe('review_draft@3');

    // An impossible set size is not sent.
    await type('eval-run-limit', '900');
    inPage<HTMLButtonElement>('eval-run-start')!.click();
    await stable();
    expect(http.match(startOf('review_draft'))).toHaveLength(0);

    await type('eval-run-limit', '50');
    await type('eval-run-prompt', 'review_draft@2');
    inPage<HTMLButtonElement>('eval-run-start')!.click();
    const start = await next(startOf('review_draft'), 'POST');
    expect(start.request.body).toEqual({
      modelId: SONNET_ID,
      promptVersion: 'review_draft@2',
      limit: 50,
    });
    const running = reviewSummary(RUN_C, {
      status: 'running',
      finishedAt: null,
      scores: null,
      cost: null,
      credits: null,
      promptVersion: 'review_draft@2',
    });
    start.flush(running, { status: 202, statusText: 'Accepted' });
    await stable();

    expect(router.url).toBe(`/ai/evals?run=${RUN_C}`);
    expect(inPage('eval-run-dialog')).toBeNull();
    (await next(runsOf('review_draft'))).flush(reviewRuns([running, reviewSummary(RUN_A)]));
    (await next(runOf('review_draft', RUN_C))).flush(reviewRun(RUN_C, { ...running, cases: null }));
    await stable();
    expect(textOf(find('eval-card-running'))).toContain('Measuring 40 cases');
    expect(textOf(find('eval-run-status', runRow(RUN_C)))).toBe('running');

    // Read again on its own while it runs; once done, no more reads.
    (await next(runsOf('review_draft'))).flush(
      reviewRuns([reviewSummary(RUN_C), reviewSummary(RUN_A)]),
    );
    (await next(runOf('review_draft', RUN_C))).flush(reviewRun(RUN_C));
    await stable();
    expect(textOf(find('eval-card-status'))).toBe('done');
    expect(find('eval-card-running')).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 100));
    await stable();
    expect(http.match(() => true)).toHaveLength(0);
  });

  it('says why the server refused a run', async () => {
    await open();
    find<HTMLButtonElement>('eval-new-run')!.click();
    await dialogShown();
    inPage<HTMLButtonElement>('eval-run-start')!.click();
    (await next(startOf('review_draft'), 'POST')).flush(
      { statusCode: 422, message: 'No settled drafts to measure the model on yet', error: 'x' },
      { status: 422, statusText: 'Unprocessable Entity' },
    );
    await stable();
    expect(textOf(inPage('eval-run-error'))).toBe(
      'The server refused the run. No settled drafts to measure the model on yet',
    );
    expect(inPage('eval-run-dialog')).not.toBeNull();
  });
});
