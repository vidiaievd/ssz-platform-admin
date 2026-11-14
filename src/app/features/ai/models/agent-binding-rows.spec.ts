import { BindingSettingsDto } from '../../../api/ai/models/binding-settings-dto';
import { BindingChangeResponseDto } from '../../../api/ai/models/binding-change-response-dto';
import { CapabilityBindingResponseDto } from '../../../api/ai/models/capability-binding-response-dto';
import { ModelResponseDto } from '../../../api/ai/models/model-response-dto';
import { ProviderResponseDto } from '../../../api/ai/models/provider-response-dto';
import {
  Registry,
  agentBindingRows,
  bindableModels,
  changedFields,
  formatRequirements,
} from './agent-binding-rows';

function provider(
  id: string,
  code: string,
  region: ProviderResponseDto['region'],
): ProviderResponseDto {
  return {
    id,
    code,
    displayName: code,
    kind: 'anthropic',
    region,
    enabled: true,
    configured: true,
    missing: [],
    modelCount: 1,
    apiVersion: null,
    baseUrl: null,
    credentialRef: null,
  };
}

function llm(
  id: string,
  providerId: string,
  name: string,
  overrides: Partial<ModelResponseDto> = {},
) {
  return {
    id,
    providerId,
    providerCode: providerId,
    providerModelId: name.toLowerCase(),
    displayName: name,
    modality: 'llm',
    status: 'active',
    currentPrice: null,
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
  } satisfies ModelResponseDto;
}

const registry: Registry = {
  providers: [provider('p-a', 'anthropic', 'eu'), provider('p-g', 'google', 'global')],
  models: [
    llm('m-1', 'p-a', 'Sonnet'),
    llm('m-2', 'p-g', 'Gemini Flash', { status: 'deprecated' }),
    llm('m-3', 'p-a', 'Old', { status: 'disabled' }),
    {
      ...llm('m-4', 'p-g', 'Speech'),
      modality: 'speech',
      features: { languages: ['nb'], maxAudioSeconds: 600, pronunciation: true, wordTimings: true },
    },
  ],
};

const capability = (
  code: string,
  binding: CapabilityBindingResponseDto['binding'],
): CapabilityBindingResponseDto => ({
  capability: code,
  description: code,
  modality: 'llm',
  requiredFeatures: { structuredOutput: 'native' },
  binding,
});

const binding = {
  capability: 'review_draft',
  primaryModelId: 'm-1',
  fallbackModelId: 'm-gone',
  enabled: true,
  maxOutputTokens: 2048,
  promptVersion: 'review_draft@3',
  temperature: null,
  timeoutMs: 30_000,
  updatedAt: '2026-11-14T10:00:00.000Z',
  updatedBy: 'admin-1',
  version: 4,
};

describe('agentBindingRows', () => {
  it('names the bound models and keeps the id of one the registry no longer has', () => {
    const [bound, unbound] = agentBindingRows(
      [capability('review_draft', binding), capability('practice', null)],
      registry,
    );
    expect(bound.primary?.model?.displayName).toBe('Sonnet');
    expect(bound.primary?.provider?.region).toBe('eu');
    expect(bound.fallback).toEqual({ id: 'm-gone', model: null, provider: null });
    expect(unbound.binding).toBeNull();
    expect(unbound.primary).toBeNull();
    expect(unbound.fallback).toBeNull();
  });

  it('shows ids only while the registry is unknown', () => {
    const [row] = agentBindingRows([capability('review_draft', binding)], null);
    expect(row.primary).toEqual({ id: 'm-1', model: null, provider: null });
  });
});

describe('bindableModels', () => {
  it('offers the modality without disabled models, grouped by provider', () => {
    expect(
      bindableModels('llm', registry).map((o) => [o.label, o.providerCode, o.region, o.status]),
    ).toEqual([
      ['Sonnet', 'anthropic', 'eu', 'active'],
      ['Gemini Flash', 'google', 'global', 'deprecated'],
    ]);
    expect(bindableModels('llm', registry)[0].maxOutput).toBe(8192);
    const speech = bindableModels('speech', registry);
    expect(speech.map((o) => o.id)).toEqual(['m-4']);
    expect(speech[0].maxOutput).toBeNull();
  });
});

describe('formatRequirements', () => {
  it('lists what is required, one line each, and drops what is not', () => {
    expect(
      formatRequirements({
        languages: ['nb', 'nn'],
        pronunciation: true,
        wordTimings: false,
        minAudioSeconds: 30,
      }),
    ).toEqual(['languages: nb, nn', 'pronunciation', 'minAudioSeconds: 30']);
  });
});

describe('changedFields', () => {
  const settings: BindingSettingsDto = {
    primaryModelId: 'm-1',
    fallbackModelId: null,
    enabled: true,
    promptVersion: 'review_draft@2',
    maxOutputTokens: 2048,
    timeoutMs: 30_000,
    temperature: null,
  };
  const change = (
    before: BindingSettingsDto | null,
    after: BindingSettingsDto,
  ): BindingChangeResponseDto => ({
    capability: 'review_draft',
    changedAt: '2026-11-14T10:00:00.000Z',
    changedBy: 'admin-1',
    version: 2,
    before,
    after,
  });

  it('lists only the fields a write changed', () => {
    expect(
      changedFields(
        change(settings, { ...settings, fallbackModelId: 'm-2', promptVersion: 'review_draft@3' }),
      ),
    ).toEqual([
      { field: 'fallbackModelId', before: null, after: 'm-2' },
      { field: 'promptVersion', before: 'review_draft@2', after: 'review_draft@3' },
    ]);
  });

  it('lists every field for the write that created the binding, none for an empty one', () => {
    expect(changedFields(change(null, settings))).toHaveLength(7);
    expect(changedFields(change(null, settings))[0].before).toBeUndefined();
    expect(changedFields(change(settings, settings))).toEqual([]);
  });
});
