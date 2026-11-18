import { BreakerBoardDto } from '../../../api/ai/models/breaker-board-dto';
import { BreakerRowDto } from '../../../api/ai/models/breaker-row-dto';
import { ModelResponseDto } from '../../../api/ai/models/model-response-dto';
import { ProviderResponseDto } from '../../../api/ai/models/provider-response-dto';

/** Fixtures of "AI → Providers" shared by its specs. */

export function provider(
  id: string,
  code: string,
  overrides: Partial<ProviderResponseDto> = {},
): ProviderResponseDto {
  return {
    id,
    code,
    displayName: code[0].toUpperCase() + code.slice(1),
    kind: 'anthropic',
    region: 'eu',
    enabled: true,
    configured: true,
    missing: [],
    modelCount: 1,
    apiVersion: null,
    baseUrl: null,
    credentialRef: `${code.toUpperCase()}_API_KEY`,
    ...overrides,
  };
}

export function model(
  id: string,
  providerId: string,
  displayName: string,
  overrides: Partial<ModelResponseDto> = {},
): ModelResponseDto {
  return {
    id,
    providerId,
    providerCode: providerId,
    providerModelId: displayName.toLowerCase().replace(/\s+/g, '-'),
    displayName,
    modality: 'llm',
    status: 'active',
    currentPrice: {
      currency: 'USD',
      effectiveFrom: '2026-10-01T00:00:00.000Z',
      inputPerMtok: '3.000000',
      outputPerMtok: '15.000000',
      cacheReadPerMtok: '0.300000',
      cacheWritePerMtok: '0.000000',
      audioPerHour: '0.000000',
      charsPerMillion: '0.000000',
    },
    features: {
      audioIn: false,
      batch: false,
      contextWindow: 200_000,
      maxOutput: 8192,
      promptCache: true,
      streaming: true,
      structuredOutput: 'native',
      tools: true,
      vision: false,
    },
    ...overrides,
  };
}

export function breaker(
  m: ModelResponseDto,
  p: ProviderResponseDto,
  bindings: BreakerRowDto['bindings'],
  overrides: Partial<BreakerRowDto> = {},
): BreakerRowDto {
  return {
    modelId: m.id,
    displayName: m.displayName,
    modality: m.modality,
    providerModelId: m.providerModelId,
    status: m.status,
    provider: { id: p.id, code: p.code, displayName: p.displayName, enabled: p.enabled },
    bindings,
    state: 'closed',
    recentFailures: 0,
    reopensAt: null,
    reopensInMs: null,
    ...overrides,
  };
}

// Anthropic (Sonnet, Haiku) and Google (Flash); OpenAI without its key.
export const anthropic = provider('p-a', 'anthropic');
export const google = provider('p-g', 'google', { kind: 'google', region: 'global' });
export const openai = provider('p-o', 'openai', {
  kind: 'openai',
  region: 'us',
  enabled: false,
  configured: false,
  missing: ['OPENAI_API_KEY'],
  modelCount: 0,
});
export const providers = [anthropic, google, openai];

export const sonnet = model('m-sonnet', 'p-a', 'Sonnet');
export const haiku = model('m-haiku', 'p-a', 'Haiku', { currentPrice: null });
export const flash = model('m-flash', 'p-g', 'Gemini Flash');
export const azureSpeech = model('m-speech', 'p-g', 'Azure Speech', {
  modality: 'speech',
  features: { languages: ['nb'], maxAudioSeconds: 600, pronunciation: true, wordTimings: true },
});
export const models = [sonnet, haiku, flash, azureSpeech];

/**
 * review_draft: Sonnet → Flash (another provider); practice: Sonnet → Haiku (same provider);
 * diagnostic: Haiku alone; voice_review (off): Azure Speech alone.
 */
export const board: BreakerBoardDto = {
  settings: { failures: 5, windowMs: 60_000, openMs: 30_000, maxRetryAfterMs: 10_000 },
  storeAvailable: true,
  items: [
    breaker(
      sonnet,
      anthropic,
      [
        { capability: 'review_draft', role: 'primary', enabled: true },
        { capability: 'practice', role: 'primary', enabled: true },
      ],
      {
        state: 'open',
        recentFailures: 5,
        reopensAt: '2026-11-14T12:00:30.000Z',
        reopensInMs: 30_000,
      },
    ),
    breaker(
      haiku,
      anthropic,
      [
        { capability: 'practice', role: 'fallback', enabled: true },
        { capability: 'diagnostic', role: 'primary', enabled: true },
      ],
      { recentFailures: 2 },
    ),
    breaker(flash, google, [{ capability: 'review_draft', role: 'fallback', enabled: true }]),
    breaker(azureSpeech, google, [{ capability: 'voice_review', role: 'primary', enabled: false }]),
  ],
};
