import { CapabilitySpendDto } from '../../../api/ai/models/capability-spend-dto';
import { ModelSpendDto } from '../../../api/ai/models/model-spend-dto';
import { PlatformSpendResponseDto } from '../../../api/ai/models/platform-spend-response-dto';

/** Test data of `GET admin/ai/spend`, shaped like the dev ledger (Azure Speech, TTS, Gemini). */

const zero = {
  calls: 0,
  failed: 0,
  fallbackCalls: 0,
  unpricedCalls: 0,
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  audioMs: 0,
  characters: 0,
  cost: [],
  credits: '0',
};

export function capabilitySpend(
  capability: string,
  overrides: Partial<CapabilitySpendDto> = {},
): CapabilitySpendDto {
  return { ...zero, capability, ...overrides };
}

export function modelSpend(
  modelId: string,
  displayName: string | null,
  overrides: Partial<ModelSpendDto> = {},
): ModelSpendDto {
  return {
    ...zero,
    modelId,
    model: displayName
      ? { displayName, modality: 'llm', providerModelId: modelId, status: 'active' }
      : null,
    provider: displayName
      ? { id: 'p-1', code: 'google', displayName: 'Google', kind: 'google', region: 'global' }
      : null,
    boundTo: [],
    byCapability: [],
    ...overrides,
  };
}

export const speech = modelSpend('m-azure-speech', 'Azure Speech', {
  model: {
    displayName: 'Azure Speech',
    modality: 'speech',
    providerModelId: 'nb-NO',
    status: 'active',
  },
  provider: {
    id: 'p-az',
    code: 'azure',
    displayName: 'Azure',
    kind: 'azure_speech',
    region: 'eu',
  },
  calls: 711,
  failed: 3,
  audioMs: 1_750_221,
  cost: [{ amount: '0.486234', currency: 'USD' }],
  credits: '120',
  boundTo: [{ capability: 'voice_review', role: 'primary' }],
  byCapability: [
    capabilitySpend('voice_review', {
      calls: 700,
      failed: 3,
      audioMs: 1_700_000,
      cost: [{ amount: '0.470000', currency: 'USD' }],
    }),
    capabilitySpend('sound_session', {
      calls: 11,
      audioMs: 50_221,
      cost: [{ amount: '0.016234', currency: 'USD' }],
    }),
  ],
});

export const gemini = modelSpend('m-gemini', 'Gemini Flash', {
  calls: 40,
  fallbackCalls: 2,
  unpricedCalls: 5,
  inputTokens: 120_000,
  outputTokens: 9_000,
  cacheReadTokens: 4_000,
  cost: [{ amount: '0.169562', currency: 'USD' }],
  credits: '30',
  boundTo: [{ capability: 'student_assist', role: 'primary' }],
  byCapability: [
    capabilitySpend('student_assist', {
      calls: 40,
      unpricedCalls: 5,
      cost: [{ amount: '0.169562', currency: 'USD' }],
    }),
  ],
});

/** Bound, never called — a row of zeros. */
export const whisper = modelSpend('m-whisper', 'NB-Whisper', {
  boundTo: [{ capability: 'voice_review', role: 'fallback' }],
});

export function spendResponse(models: ModelSpendDto[] = [speech, gemini, whisper]) {
  const body: PlatformSpendResponseDto = {
    from: '2026-11-12',
    to: '2026-11-14',
    totals: {
      calls: 751,
      failed: 3,
      fallbackCalls: 2,
      unpricedCalls: 5,
      inputTokens: 120_000,
      outputTokens: 9_000,
      cacheReadTokens: 4_000,
      cacheWriteTokens: 0,
      audioMs: 1_750_221,
      characters: 0,
      cost: [{ amount: '0.655796', currency: 'USD' }],
      credits: '150',
    },
    models,
    daily: [
      {
        day: '2026-11-12',
        calls: 300,
        cost: [{ amount: '0.200000', currency: 'USD' }],
        byModel: [
          {
            modelId: 'm-azure-speech',
            calls: 300,
            cost: [{ amount: '0.200000', currency: 'USD' }],
          },
        ],
      },
      { day: '2026-11-13', calls: 0, cost: [], byModel: [] },
      {
        day: '2026-11-14',
        calls: 451,
        cost: [{ amount: '0.455796', currency: 'USD' }],
        byModel: [
          {
            modelId: 'm-azure-speech',
            calls: 411,
            cost: [{ amount: '0.286234', currency: 'USD' }],
          },
          { modelId: 'm-gemini', calls: 40, cost: [{ amount: '0.169562', currency: 'USD' }] },
        ],
      },
    ],
  };
  return body;
}
