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
import { TestModelResponseDto } from '../../../api/ai/models/test-model-response-dto';
import { routes } from '../../../app.routes';
import { AdminLevel } from '../../../core/auth/admin-level';
import { provideApiClients } from '../../../core/api/provide-api-clients';
import { SessionStore } from '../../../core/auth/session.store';
import { adminToken, sessionBody, settle } from '../../../core/auth/testing';
import { APP_CONFIG } from '../../../core/config/app-config';
import { anthropic, board, models, providers, sonnet } from './provider-fixtures';
// Real English texts, so a missing key would show up as the key itself.
import en from '../../../../../public/i18n/en.json';

const AI = 'http://gw/api/v1/admin/ai';
const PROVIDERS = `${AI}/providers`;
const MODELS = `${AI}/models`;
const BREAKERS = `${AI}/breakers`;

describe('AiProvidersPage', () => {
  let http: HttpTestingController;
  let el: HTMLElement;

  beforeEach(() => {
    // Money and dates in English, as the texts are.
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

  /** The three reads of the tab, answered. */
  async function answerReads(): Promise<void> {
    (await next(PROVIDERS)).flush(providers);
    (await next(MODELS)).flush(models);
    (await next(BREAKERS)).flush(board);
    await stable();
  }

  async function open(level: AdminLevel = 'super'): Promise<void> {
    TestBed.inject(SessionStore).start(sessionBody(adminToken({ admin_level: level })));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/ai/providers');
    el = harness.fixture.nativeElement as HTMLElement;
    await answerReads();
  }

  const find = <T extends HTMLElement = HTMLElement>(testId: string, root: ParentNode = el) =>
    root.querySelector<T>(`[data-testid="${testId}"]`);
  const inPage = <T extends HTMLElement = HTMLElement>(testId: string) =>
    find<T>(testId, document.body);
  const textOf = (node: Element | null) => node?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
  const card = (code: string) =>
    el.querySelector<HTMLElement>(`[data-testid="provider-card"][data-provider="${code}"]`)!;
  const modelRow = (providerModelId: string) =>
    el.querySelector<HTMLElement>(`[data-testid="model-row"][data-model="${providerModelId}"]`)!;

  async function dialogShown(testId = 'reason-input'): Promise<void> {
    await vi.waitFor(async () => {
      await stable();
      expect(inPage(testId)?.isConnected).toBe(true);
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

  it('is a tab of the AI section: a card per provider with its key, switch and models', async () => {
    await open();
    expect(TestBed.inject(Router).url).toBe('/ai/providers');
    expect(find('ai-tab-providers')?.getAttribute('aria-current')).toBe('page');
    expect(textOf(find('breaker-settings'))).toContain('after 5 retryable failures within 60 s');

    expect(textOf(find('provider-key', card('anthropic')))).toBe('key present');
    expect(textOf(find('provider-state', card('anthropic')))).toBe('on');
    // OpenAI has no key: the missing variable is named and it cannot be switched on.
    expect(textOf(find('provider-key', card('openai')))).toBe(
      'not configured, missing: OPENAI_API_KEY',
    );
    expect(find<HTMLButtonElement>('provider-toggle', card('openai'))!.disabled).toBe(true);
    expect(textOf(find('provider-no-models', card('openai')))).toBe(
      'No model of this provider is registered.',
    );

    // Sonnet: price in effect, open breaker, the agents that call it.
    const sonnetRow = modelRow('sonnet');
    expect(textOf(find('model-price', sonnetRow))).toBe(
      'in $3.00 / 1M tokens out $15.00 / 1M tokens cache read $0.30 / 1M',
    );
    expect(textOf(find('model-breaker', sonnetRow))).toMatch(/^open until .+ failures 5 of 5$/);
    expect(textOf(find('model-bindings', sonnetRow))).toBe(
      'Used by: review_draft (primary), practice (primary)',
    );
    // Haiku has no price; Azure Speech is a speech model and cannot be tested.
    expect(textOf(find('model-price', modelRow('haiku')))).toBe('no price: calls are not costed');
    expect(textOf(find('model-price', modelRow('azure-speech')))).toBe('$0.00 / audio hour');
    expect(find<HTMLButtonElement>('model-test', modelRow('azure-speech'))!.disabled).toBe(true);
    expect(find('breaker-reset', modelRow('gemini-flash'))).toBeNull();
  });

  it('shows support everything but no action, and reads a price history on demand', async () => {
    await open('support');
    expect(find('provider-toggle')).toBeNull();
    expect(find('model-status-change')).toBeNull();
    expect(find('breaker-reset')).toBeNull();
    expect(find('model-test')).toBeNull();

    find('model-prices-toggle', modelRow('sonnet'))!.click();
    (await next(`${MODELS}/m-sonnet/prices`)).flush([
      sonnet.currentPrice,
      {
        ...sonnet.currentPrice,
        effectiveFrom: '2026-01-01T00:00:00.000Z',
        inputPerMtok: '4.000000',
      },
    ]);
    await stable();
    const entries = [...el.querySelectorAll('[data-testid="model-price-entry"]')].map(textOf);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toContain('(latest)');
    expect(entries[1]).toContain('in $4.00 / 1M tokens');
  });

  it('shows admin the reset and the test, not the switches', async () => {
    await open('admin');
    expect(find('provider-toggle')).toBeNull();
    expect(find('model-status-change')).toBeNull();
    expect(find('breaker-reset', modelRow('sonnet'))).not.toBeNull();
    expect(find('model-test', modelRow('sonnet'))).not.toBeNull();
  });

  it('switches a provider off: warns which agents are left, sends the reason, shows the answer', async () => {
    await open();
    find<HTMLButtonElement>('provider-toggle', card('anthropic'))!.click();
    await dialogShown();
    expect(textOf(inPage('preflight-stranded'))).toContain('diagnostic, practice');

    await type('reason-input', 'Anthropic outage');
    await confirm();
    const put = await next(`${PROVIDERS}/p-a`, 'PUT');
    expect(put.request.body).toEqual({ enabled: false, reason: 'Anthropic outage' });
    put.flush({
      ...anthropic,
      enabled: false,
      changed: true,
      strandedCapabilities: ['diagnostic', 'practice'],
    });

    // Every read again: a provider's switch changes cards, models' reach and the board.
    await answerReads();
    expect(textOf(find('stranded-notice'))).toContain('After the change of Anthropic');
    expect(textOf(find('stranded-notice'))).toContain('diagnostic, practice');
    find('stranded-dismiss')!.click();
    await stable();
    expect(find('stranded-notice')).toBeNull();
  });

  it("changes a model's status only to another one, warning before disabling", async () => {
    await open();
    find<HTMLButtonElement>('model-status-change', modelRow('haiku'))!.click();
    await dialogShown();
    expect(inPage('model-status-same')).not.toBeNull();
    await type('reason-input', 'Retire Haiku');
    await confirm();
    // The same status sends nothing.
    expect(http.match((r) => r.method === 'PUT')).toHaveLength(0);

    inPage<HTMLInputElement>('model-status-disabled')!.click();
    await stable();
    expect(textOf(inPage('preflight-stranded'))).toContain('diagnostic');
    await confirm();

    const put = await next(`${MODELS}/m-haiku/status`, 'PUT');
    expect(put.request.body).toEqual({ status: 'disabled', reason: 'Retire Haiku' });
    put.flush({ ...models[1], status: 'disabled', changed: true, strandedCapabilities: [] });
    (await next(MODELS)).flush(models);
    (await next(BREAKERS)).flush(board);
    await stable();
    expect(find('stranded-notice')).toBeNull();
  });

  it('resets an open breaker with a reason and reads the board again', async () => {
    await open('admin');
    find<HTMLButtonElement>('breaker-reset', modelRow('sonnet'))!.click();
    await dialogShown();
    await type('reason-input', 'Provider recovered');
    await confirm();
    const post = await next(`${BREAKERS}/m-sonnet/reset`, 'POST');
    expect(post.request.body).toEqual({ reason: 'Provider recovered' });
    post.flush({ ...board.items[0], state: 'closed', recentFailures: 0, changed: true });
    (await next(BREAKERS)).flush(board);
    await stable();
  });

  it('tests a model: optional reason, the answer stays in the dialog', async () => {
    await open('admin');
    find<HTMLButtonElement>('model-test', modelRow('sonnet'))!.click();
    await dialogShown('model-test-run');

    inPage<HTMLButtonElement>('model-test-run')!.click();
    const first = await next(`${MODELS}/m-sonnet/test`, 'POST');
    expect(first.request.body).toEqual({});
    const answer: TestModelResponseDto = {
      callId: 'call-1',
      outcome: 'ok',
      errorCode: null,
      errorMessage: null,
      latencyMs: 812,
      cost: { micros: 1234, currency: 'USD' },
      credits: '0.123400',
      usage: { input: 120, output: 30, cacheRead: 0, cacheWrite: 0 },
      output: { kind: 'structured', data: { ok: true } },
      providerRequestId: 'req-1',
      retryable: null,
      stop: 'end',
    };
    first.flush(answer);
    await stable();
    expect(textOf(inPage('model-test-outcome'))).toBe('works');
    expect(textOf(inPage('model-test-latency'))).toBe('812 ms');
    expect(textOf(inPage('model-test-cost'))).toBe('$0.0012 · 0.123400 credits');
    expect(textOf(inPage('model-test-tokens'))).toBe('120 / 30');

    // Again, with a reason; a failed call is an answer, not an error.
    await type('model-test-reason', 'New key');
    inPage<HTMLButtonElement>('model-test-run')!.click();
    const second = await next(`${MODELS}/m-sonnet/test`, 'POST');
    expect(second.request.body).toEqual({ reason: 'New key' });
    second.flush({
      ...answer,
      outcome: 'error',
      errorCode: 'auth',
      errorMessage: 'invalid x-api-key',
      cost: { micros: 0, currency: 'USD' },
      credits: '0.000000',
      usage: null,
      output: null,
      retryable: false,
    });
    await stable();
    expect(textOf(inPage('model-test-outcome'))).toBe('call failed');
    expect(textOf(inPage('model-test-error-code'))).toBe('auth');
    expect(textOf(inPage('model-test-message'))).toBe('invalid x-api-key');
    expect(inPage('model-test-error')).toBeNull();
  });

  it('keeps the cards when the models and the board fail, and cannot warn before a switch', async () => {
    TestBed.inject(SessionStore).start(sessionBody(adminToken()));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/ai/providers');
    el = harness.fixture.nativeElement as HTMLElement;
    (await next(PROVIDERS)).flush(providers);
    (await next(MODELS)).flush(null, { status: 503, statusText: 'Unavailable' });
    (await next(BREAKERS)).flush(null, { status: 503, statusText: 'Unavailable' });
    await stable();

    expect(find('models-failed')).not.toBeNull();
    expect(find('breakers-failed')).not.toBeNull();
    expect(card('anthropic')).not.toBeNull();
    expect(find('model-row')).toBeNull();

    find<HTMLButtonElement>('provider-toggle', card('anthropic'))!.click();
    await dialogShown();
    expect(inPage('preflight-unknown')).not.toBeNull();
  });
});
