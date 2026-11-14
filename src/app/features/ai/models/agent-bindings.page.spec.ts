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
import { BindingResponseDto } from '../../../api/ai/models/binding-response-dto';
import { CapabilityBindingResponseDto } from '../../../api/ai/models/capability-binding-response-dto';
import { ModelResponseDto } from '../../../api/ai/models/model-response-dto';
import { ProviderResponseDto } from '../../../api/ai/models/provider-response-dto';
import { routes } from '../../../app.routes';
import { AdminLevel } from '../../../core/auth/admin-level';
import { provideApiClients } from '../../../core/api/provide-api-clients';
import { SessionStore } from '../../../core/auth/session.store';
import { adminToken, sessionBody, settle } from '../../../core/auth/testing';
import { APP_CONFIG } from '../../../core/config/app-config';
// Real English texts, so a missing key would show up as the key itself.
import en from '../../../../../public/i18n/en.json';

const BINDINGS = 'http://gw/api/v1/admin/ai/bindings';
const MODELS = 'http://gw/api/v1/admin/ai/models';
const PROVIDERS = 'http://gw/api/v1/admin/ai/providers';

const providers: ProviderResponseDto[] = [
  {
    id: 'p-a',
    code: 'anthropic',
    displayName: 'Anthropic',
    kind: 'anthropic',
    region: 'eu',
    enabled: true,
    configured: true,
    missing: [],
    modelCount: 2,
    apiVersion: null,
    baseUrl: null,
    credentialRef: 'ANTHROPIC_API_KEY',
  },
  {
    id: 'p-g',
    code: 'google',
    displayName: 'Google',
    kind: 'google',
    region: 'global',
    enabled: true,
    configured: true,
    missing: [],
    modelCount: 1,
    apiVersion: null,
    baseUrl: null,
    credentialRef: 'GEMINI_API_KEY',
  },
];

const llmFeatures = (maxOutput: number) => ({
  audioIn: false,
  batch: false,
  contextWindow: 200_000,
  maxOutput,
  promptCache: true,
  streaming: true,
  structuredOutput: 'native' as const,
  tools: true,
  vision: false,
});

function model(
  id: string,
  providerId: string,
  displayName: string,
  overrides: Partial<ModelResponseDto> = {},
): ModelResponseDto {
  return {
    id,
    providerId,
    providerCode: providerId === 'p-a' ? 'anthropic' : 'google',
    providerModelId: displayName.toLowerCase(),
    displayName,
    modality: 'llm',
    status: 'active',
    currentPrice: null,
    features: llmFeatures(8192),
    ...overrides,
  };
}

const models: ModelResponseDto[] = [
  model('m-sonnet', 'p-a', 'Sonnet'),
  model('m-haiku', 'p-a', 'Haiku', { features: llmFeatures(4096) }),
  model('m-flash', 'p-g', 'Gemini Flash', { status: 'deprecated' }),
  model('m-old', 'p-a', 'Old model', { status: 'disabled' }),
  model('m-azure', 'p-g', 'Azure Speech', {
    modality: 'speech',
    features: { languages: ['nb'], maxAudioSeconds: 600, pronunciation: true, wordTimings: true },
  }),
];

const reviewBinding: BindingResponseDto = {
  capability: 'review_draft',
  primaryModelId: 'm-sonnet',
  fallbackModelId: 'm-flash',
  enabled: true,
  maxOutputTokens: 2048,
  promptVersion: 'review_draft@3',
  temperature: null,
  timeoutMs: 30_000,
  updatedAt: '2026-11-14T10:00:00.000Z',
  updatedBy: 'admin-7',
  version: 4,
};

const capabilities: CapabilityBindingResponseDto[] = [
  {
    capability: 'review_draft',
    description: 'Drafts a review for the teacher',
    modality: 'llm',
    requiredFeatures: { structuredOutput: 'native' },
    binding: reviewBinding,
  },
  {
    capability: 'practice',
    description: 'Pre-hand-in rehearsal',
    modality: 'llm',
    requiredFeatures: {},
    binding: null,
  },
  {
    capability: 'voice_review',
    description: 'Reads a recording',
    modality: 'speech',
    requiredFeatures: { languages: ['nb'], wordTimings: true },
    binding: {
      ...reviewBinding,
      capability: 'voice_review',
      primaryModelId: 'm-azure',
      fallbackModelId: null,
      enabled: false,
      promptVersion: 'voice_review@1',
      timeoutMs: 60_000,
      version: 1,
    },
  },
];

describe('AgentBindingsPage', () => {
  let http: HttpTestingController;
  let el: HTMLElement;

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

  async function open(level: AdminLevel = 'super', path = '/ai'): Promise<void> {
    TestBed.inject(SessionStore).start(sessionBody(adminToken({ admin_level: level })));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(path);
    el = harness.fixture.nativeElement as HTMLElement;
    (await next(BINDINGS)).flush(capabilities);
    (await next(MODELS)).flush(models);
    (await next(PROVIDERS)).flush(providers);
    await stable();
  }

  const find = <T extends HTMLElement = HTMLElement>(testId: string, root: ParentNode = el) =>
    root.querySelector<T>(`[data-testid="${testId}"]`);
  const inPage = <T extends HTMLElement = HTMLElement>(testId: string) =>
    find<T>(testId, document.body);
  const textOf = (node: Element | null) => node?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
  const row = (capability: string) =>
    el.querySelector<HTMLElement>(`[data-testid="binding-row"][data-capability="${capability}"]`)!;

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

  /**
   * Options of the select opened last. In jsdom a closed overlay can stay in the page, so the
   * newest overlay is the one that counts.
   */
  function latestOptions(): HTMLElement[] {
    const overlays = document.body.querySelectorAll('.p-select-overlay');
    const latest = overlays[overlays.length - 1];
    return latest ? [...latest.querySelectorAll<HTMLElement>('[role="option"]')] : [];
  }

  async function openSelect(testId: string): Promise<string[]> {
    const before = document.body.querySelectorAll('.p-select-overlay').length;
    inPage(testId)!.click();
    await vi.waitFor(async () => {
      await stable();
      expect(document.body.querySelectorAll('.p-select-overlay').length).toBeGreaterThan(before);
      expect(latestOptions().length).toBeGreaterThan(0);
    });
    return latestOptions().map((o) => textOf(o)!);
  }

  async function choose(option: string): Promise<void> {
    latestOptions()
      .find((o) => o.textContent!.includes(option))!
      .click();
    await stable();
  }

  async function confirm(): Promise<void> {
    inPage<HTMLButtonElement>('reason-confirm')!.click();
    await stable();
  }

  it('opens the first tab at /ai and lists every agent with its models, state and limits', async () => {
    await open();
    expect(TestBed.inject(Router).url).toBe('/ai/models');

    expect(textOf(find('binding-primary-cell', row('review_draft')))).toBe('Sonnet anthropic · eu');
    const fallback = textOf(find('binding-fallback-cell', row('review_draft')));
    expect(fallback).toContain('Gemini Flash');
    expect(fallback).toContain('deprecated');
    expect(fallback).toContain('google · global');
    expect(textOf(find('binding-state', row('review_draft')))).toBe('on');
    expect(textOf(find('binding-limits', row('review_draft')))).toBe(
      "up to 2048 tokens temperature: provider's default timeout 30 s",
    );
    expect(textOf(find('binding-changed', row('review_draft')))).toMatch(/admin-7\s*v4$/);

    // Speech has no output tokens or temperature.
    expect(textOf(find('binding-limits', row('voice_review')))).toBe('timeout 60 s');
    expect(textOf(find('binding-state', row('voice_review')))).toBe('off');
    expect(textOf(find('binding-fallback-cell', row('voice_review')))).toBe('none');

    // An unbound agent stands out.
    expect(textOf(find('binding-state', row('practice')))).toBe('not bound');
    expect(row('practice').classList).toContain('bg-amber-50');
    expect(textOf(find('bindings-unbound'))).toContain('Agents without a model: 1.');
    expect(textOf(find('binding-edit', row('practice')))).toBe('Bind');
  });

  it('shows support and admin everything but no change', async () => {
    await open('admin');
    expect(find('binding-row')).not.toBeNull();
    expect(find('binding-edit')).toBeNull();
    expect(find('binding-history-toggle')).not.toBeNull();
  });

  it('keeps the rows with model ids when the registry fails, and waits to edit', async () => {
    TestBed.inject(SessionStore).start(sessionBody(adminToken()));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/ai/models');
    el = harness.fixture.nativeElement as HTMLElement;
    (await next(BINDINGS)).flush(capabilities);
    (await next(MODELS)).flush(null, { status: 503, statusText: 'Unavailable' });
    // forkJoin cancels the other request once one fails.
    http.match(PROVIDERS);
    await stable();

    expect(find('registry-failed')).not.toBeNull();
    expect(textOf(find('binding-primary-cell', row('review_draft')))).toBe('m-sonnet');
    expect(find<HTMLButtonElement>('binding-edit', row('review_draft'))!.disabled).toBe(true);
  });

  it('unfolds the history on demand, with what each write changed', async () => {
    await open();
    find('binding-history-toggle', row('review_draft'))!.click();
    (await next(`${BINDINGS}/review_draft/history`)).flush([
      {
        capability: 'review_draft',
        changedAt: '2026-11-14T10:00:00.000Z',
        changedBy: 'admin-7',
        version: 4,
        before: {
          primaryModelId: 'm-haiku',
          fallbackModelId: 'm-flash',
          enabled: true,
          maxOutputTokens: 2048,
          promptVersion: 'review_draft@3',
          temperature: null,
          timeoutMs: 30_000,
        },
        after: {
          primaryModelId: 'm-sonnet',
          fallbackModelId: 'm-flash',
          enabled: true,
          maxOutputTokens: 2048,
          promptVersion: 'review_draft@3',
          temperature: null,
          timeoutMs: 30_000,
        },
      },
      {
        capability: 'review_draft',
        changedAt: '2026-10-01T10:00:00.000Z',
        changedBy: 'seed',
        version: 1,
        before: null,
        after: {
          primaryModelId: 'm-haiku',
          fallbackModelId: null,
          enabled: false,
          maxOutputTokens: 2048,
          promptVersion: 'review_draft@3',
          temperature: 0.2,
          timeoutMs: 30_000,
        },
      },
    ]);
    await stable();

    const entries = [...el.querySelectorAll('[data-testid="binding-history-entry"]')];
    expect(entries).toHaveLength(2);
    const fields = (i: number) =>
      [...entries[i].querySelectorAll('[data-testid="binding-history-field"]')].map((f) =>
        textOf(f),
      );
    expect(fields(0)).toEqual(['Primary: Haiku → Sonnet']);
    expect(textOf(entries[1])).toContain('created');
    expect(fields(1)).toContain('Fallback: —');
    expect(fields(1)).toContain('Agent: off');
    expect(fields(1)).toContain('Temperature: 0.2');

    // Folding and unfolding again reads nothing new.
    find('binding-history-toggle', row('review_draft'))!.click();
    await stable();
    expect(find('binding-history')).toBeNull();
  });

  it('changes the models: only the modality, not disabled, a fallback other than the primary', async () => {
    await open();
    find<HTMLButtonElement>('binding-edit', row('review_draft'))!.click();
    await dialogShown();
    expect(textOf(inPage('binding-requirements'))).toBe(
      'Both models must have: structuredOutput: native',
    );

    const offered = await openSelect('binding-primary');
    expect(offered).toEqual([
      'Haiku anthropic · eu',
      'Sonnet anthropic · eu',
      'Gemini Flash google · global deprecated',
    ]);
    await choose('Haiku');

    // Haiku allows 4096 output tokens.
    await type('binding-max-output', '5000');
    expect(textOf(inPage('binding-max-output-error'))).toBe(
      'The chosen models allow at most 4096.',
    );
    await type('binding-max-output', '4000');
    expect(inPage('binding-max-output-error')).toBeNull();

    await type('binding-temperature', '0,3');
    await type('reason-input', 'Haiku is enough for drafts');
    await confirm();

    const put = await next(`${BINDINGS}/review_draft`, 'PUT');
    expect(put.request.body).toEqual({
      primaryModelId: 'm-haiku',
      fallbackModelId: 'm-flash',
      enabled: true,
      promptVersion: 'review_draft@3',
      maxOutputTokens: 4000,
      timeoutMs: 30_000,
      temperature: 0.3,
      expectedVersion: 4,
      reason: 'Haiku is enough for drafts',
    });
    put.flush({ ...reviewBinding, primaryModelId: 'm-haiku', version: 5 });
    (await next(BINDINGS)).flush(capabilities);
    await stable();
    expect(inPage('reason-dialog')).toBeNull();
  });

  it('binds an unbound agent as "create only" and marks the empty required fields', async () => {
    await open();
    find<HTMLButtonElement>('binding-edit', row('practice'))!.click();
    await dialogShown();
    await confirm();
    expect(http.match((r) => r.method === 'PUT')).toHaveLength(0);
    expect(inPage('binding-primary-error')).not.toBeNull();
    expect(inPage('binding-prompt-error')).not.toBeNull();

    await openSelect('binding-primary');
    await choose('Sonnet');
    // The primary is not offered as its own fallback.
    const fallbacks = await openSelect('binding-fallback');
    expect(fallbacks.some((o) => o.includes('Sonnet'))).toBe(false);
    await choose('Gemini Flash');
    await type('binding-prompt', 'practice@9');
    await type('reason-input', 'Turn the rehearsal on');
    await confirm();

    const put = await next(`${BINDINGS}/practice`, 'PUT');
    expect(put.request.body).toMatchObject({
      primaryModelId: 'm-sonnet',
      fallbackModelId: 'm-flash',
      promptVersion: 'practice@9',
      maxOutputTokens: 2048,
      timeoutMs: 30_000,
      temperature: null,
      expectedVersion: 0,
    });
    // The server's list of problems stays inside the dialog.
    put.flush(
      {
        message: 'Binding for "practice" cannot be written',
        missing: [
          'prompt version "practice@9" is unknown to "practice" (known: practice@1, practice@2)',
        ],
      },
      { status: 422, statusText: 'Unprocessable Entity' },
    );
    await stable();
    expect(textOf(inPage('reason-error'))).toContain('The server refused the change.');
    expect(textOf(inPage('reason-error-details'))).toBe(
      'prompt version "practice@9" is unknown to "practice" (known: practice@1, practice@2)',
    );
  });

  it('reads a 409 as "changed meanwhile"; speech sends its stored output cap', async () => {
    await open();
    find<HTMLButtonElement>('binding-edit', row('voice_review'))!.click();
    await dialogShown();
    expect(inPage('binding-max-output')).toBeNull();
    expect(inPage('binding-temperature')).toBeNull();
    const offered = await openSelect('binding-primary');
    expect(offered).toEqual(['Azure Speech google · global']);
    await choose('Azure Speech');
    await type('binding-timeout', '500');
    expect(inPage('binding-timeout-error')).not.toBeNull();
    await type('binding-timeout', '90000');
    await type('reason-input', 'Longer recordings');
    await confirm();

    const put = await next(`${BINDINGS}/voice_review`, 'PUT');
    expect(put.request.body).toMatchObject({
      primaryModelId: 'm-azure',
      enabled: false,
      maxOutputTokens: 2048,
      timeoutMs: 90_000,
      temperature: null,
      expectedVersion: 1,
    });
    put.flush({ statusCode: 409 }, { status: 409, statusText: 'Conflict' });
    await stable();
    expect(textOf(inPage('reason-error'))).toContain('It has changed meanwhile.');
  });
});
