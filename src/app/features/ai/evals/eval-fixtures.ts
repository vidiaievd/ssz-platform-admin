import { AssistEvalRunDto } from '../../../api/ai/models/assist-eval-run-dto';
import { AssistEvalRunSummaryDto } from '../../../api/ai/models/assist-eval-run-summary-dto';
import { AssistEvalRunsDto } from '../../../api/ai/models/assist-eval-runs-dto';
import { AssistRunScoresDto } from '../../../api/ai/models/assist-run-scores-dto';
import { EvalRunDto } from '../../../api/ai/models/eval-run-dto';
import { EvalRunSummaryDto } from '../../../api/ai/models/eval-run-summary-dto';
import { EvalRunsDto } from '../../../api/ai/models/eval-runs-dto';
import { ModelResponseDto } from '../../../api/ai/models/model-response-dto';
import { ReadingRunScoresDto } from '../../../api/ai/models/reading-run-scores-dto';
import { RunScoresDto } from '../../../api/ai/models/run-scores-dto';
import { VoiceEvalRunDto } from '../../../api/ai/models/voice-eval-run-dto';
import { VoiceEvalRunSummaryDto } from '../../../api/ai/models/voice-eval-run-summary-dto';
import { VoiceEvalRunsDto } from '../../../api/ai/models/voice-eval-runs-dto';
import { model, provider } from '../providers/provider-fixtures';

/** Fixtures of "AI → Eval" shared by its specs. */

export const SONNET_ID = '11111111-1111-4111-8111-111111111111';
export const HAIKU_ID = '22222222-2222-4222-8222-222222222222';
export const PLAIN_ID = '33333333-3333-4333-8333-333333333333';
export const AZURE_ID = '44444444-4444-4444-8444-444444444444';
export const WHISPER_ID = '55555555-5555-4555-8555-555555555555';
export const GPT_ID = '66666666-6666-4666-8666-666666666666';

export const RUN_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const RUN_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
export const RUN_C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
export const ADMIN_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

const llmFeatures = {
  audioIn: false,
  batch: false,
  contextWindow: 200_000,
  maxOutput: 8192,
  promptCache: true,
  streaming: true,
  structuredOutput: 'native' as const,
  tools: true,
  vision: false,
};

export const evalProviders = [
  provider('p-anthropic', 'anthropic'),
  provider('p-openai', 'openai', { configured: false, missing: ['OPENAI_API_KEY'] }),
  provider('p-azure', 'azure', { kind: 'azure_speech' }),
];

export const evalModels: ModelResponseDto[] = [
  model(SONNET_ID, 'p-anthropic', 'Sonnet', { providerCode: 'anthropic', features: llmFeatures }),
  model(HAIKU_ID, 'p-anthropic', 'Haiku', {
    providerCode: 'anthropic',
    status: 'deprecated',
    features: { ...llmFeatures, tools: false },
  }),
  model(PLAIN_ID, 'p-anthropic', 'Plain', {
    providerCode: 'anthropic',
    features: { ...llmFeatures, structuredOutput: 'none' },
  }),
  model(GPT_ID, 'p-openai', 'GPT', { providerCode: 'openai', features: llmFeatures }),
  model(AZURE_ID, 'p-azure', 'Azure Speech', {
    providerCode: 'azure',
    modality: 'speech',
    features: { languages: ['nb'], maxAudioSeconds: 600, pronunciation: true, wordTimings: true },
  }),
  model(WHISPER_ID, 'p-azure', 'Whisper', {
    providerCode: 'azure',
    modality: 'speech',
    features: { languages: ['nb'], maxAudioSeconds: 30, pronunciation: false, wordTimings: true },
  }),
];

export function reviewScores(overrides: Partial<RunScoresDto> = {}): RunScoresDto {
  return {
    cases: 40,
    ok: 38,
    invalidResponse: 1,
    error: 1,
    avgLatencyMs: 2350,
    confirmedRecall: 0.72,
    confirmedRecallAnyAspect: 0.8,
    remarkPrecision: 0.64,
    rejectedRepeatRate: 0.12,
    remarksPerCase: 2.4,
    sentenceAgreement: 0.81,
    markAgreement: 0.5,
    markMeanAbsDelta: 0.6,
    markBias: 0.25,
    totals: {
      confirmed: 50,
      confirmedFound: 36,
      confirmedFoundAnyAspect: 40,
      rejected: 25,
      rejectedRepeated: 3,
      remarks: 96,
      remarksOnConfirmed: 61,
      sentences: 300,
      sentencesAgreed: 243,
      marksCompared: 8,
      marksSame: 4,
      marksMissing: 0,
      marksAbsDeltaSum: 4.8,
      marksDeltaSum: 2,
    },
    ...overrides,
  };
}

export function reviewSummary(
  id: string,
  overrides: Partial<EvalRunSummaryDto> = {},
): EvalRunSummaryDto {
  return {
    id,
    capability: 'review_draft',
    modelId: SONNET_ID,
    promptVersion: 'review_draft@3',
    status: 'done',
    caseCount: 40,
    startedAt: '2026-11-14T10:00:00.000Z',
    finishedAt: '2026-11-14T10:04:30.000Z',
    startedBy: ADMIN_ID,
    bindingAtStart: {
      primaryModelId: SONNET_ID,
      fallbackModelId: null,
      promptVersion: 'review_draft@3',
    },
    matchesBinding: 'primary',
    cost: { currency: 'USD', micros: 1_250_000 },
    credits: '125.000000',
    error: null,
    skipped: { NO_KEY: 2, TEXT_GONE: 1 },
    scores: reviewScores(),
    ...overrides,
  };
}

export function reviewRuns(runs: EvalRunSummaryDto[] = []): EvalRunsDto {
  return {
    binding: {
      primaryModelId: SONNET_ID,
      fallbackModelId: HAIKU_ID,
      promptVersion: 'review_draft@3',
    },
    runs,
  };
}

export function reviewRun(id: string, overrides: Partial<EvalRunDto> = {}): EvalRunDto {
  return {
    ...reviewSummary(id),
    cases: [
      {
        caseId: 'eeeeeeee-0000-4000-8000-000000000001',
        outcome: 'ok',
        errorCode: null,
        latencyMs: 2100,
        score: {
          confirmed: 3,
          confirmedFound: 2,
          confirmedFoundAnyAspect: 2,
          rejected: 1,
          rejectedRepeated: 0,
          remarks: [
            { aspect: 'grammar', sentenceIndex: 0, verdict: 'confirmed' },
            { aspect: 'lexis', sentenceIndex: 2, verdict: 'unjudged' },
          ],
          sentences: 8,
          sentencesAgreed: 7,
          marksCompared: 0,
          marksMissing: 0,
          marksSame: 0,
          marksAbsDeltaSum: 0,
          marksDeltaSum: 0,
        },
      },
      {
        caseId: 'eeeeeeee-0000-4000-8000-000000000002',
        outcome: 'error',
        errorCode: 'TIMEOUT',
        latencyMs: 30000,
        score: null,
      },
    ],
    ...overrides,
  };
}

export function voiceScores(overrides: Partial<ReadingRunScoresDto> = {}): ReadingRunScoresDto {
  return {
    cases: 20,
    casesHeard: 18,
    prompts: 120,
    heard: 110,
    skipped: 8,
    error: 2,
    agreed: 99,
    agreement: 0.9,
    falsePass: 4,
    falsePassRate: 0.1,
    falseFail: 7,
    falseFailRate: 0.1,
    readingAgreement: 0.78,
    meanPercentApproved: 96,
    meanPercentFailed: 61,
    avgLatencyMs: 1800,
    audioMs: 840_000,
    gate: { met: true, minPrompts: 100, minAgreement: 0.85 },
    ...overrides,
  };
}

export function voiceSummary(
  id: string,
  overrides: Partial<VoiceEvalRunSummaryDto> = {},
): VoiceEvalRunSummaryDto {
  return {
    id,
    capability: 'voice_review',
    modelId: AZURE_ID,
    promptVersion: '-',
    status: 'done',
    caseCount: 20,
    startedAt: '2026-11-13T09:00:00.000Z',
    finishedAt: '2026-11-13T09:06:00.000Z',
    startedBy: ADMIN_ID,
    bindingAtStart: null,
    matchesBinding: null,
    cost: null,
    credits: null,
    error: null,
    skipped: {},
    scores: voiceScores(),
    ...overrides,
  };
}

export function voiceRuns(runs: VoiceEvalRunSummaryDto[] = []): VoiceEvalRunsDto {
  return {
    bindings: {
      voice_review: { primaryModelId: AZURE_ID, fallbackModelId: null, promptVersion: '-' },
      voice_review_pronunciation: null,
    },
    runs,
  };
}

export function voiceRun(id: string, overrides: Partial<VoiceEvalRunDto> = {}): VoiceEvalRunDto {
  return {
    ...voiceSummary(id),
    cases: [
      {
        caseId: 'ffffffff-0000-4000-8000-000000000001',
        passPercent: 80,
        prompts: [
          {
            itemId: 'p1',
            outcome: 'ok',
            machinePassed: true,
            teacherApproved: true,
            percent: 100,
            audioMs: 4000,
            latencyMs: 900,
            errorCode: null,
          },
          {
            itemId: 'p2',
            outcome: 'ok',
            machinePassed: true,
            teacherApproved: false,
            percent: 85,
            audioMs: 4100,
            latencyMs: 950,
            errorCode: null,
          },
          {
            itemId: 'p3',
            outcome: 'ok',
            machinePassed: false,
            teacherApproved: true,
            percent: 70,
            audioMs: 3900,
            latencyMs: 870,
            errorCode: null,
          },
          {
            itemId: 'p4',
            outcome: 'skipped',
            machinePassed: null,
            teacherApproved: true,
            percent: null,
            audioMs: null,
            latencyMs: 0,
            errorCode: 'NO_RECORDING',
          },
        ],
      },
    ],
    ...overrides,
  };
}

export function assistScores(overrides: Partial<AssistRunScoresDto> = {}): AssistRunScoresDto {
  return {
    set: 'assist-set@1',
    cases: 20,
    answered: 18,
    silent: 2,
    silentRate: 0.1,
    silentByCause: { BUDGET: 1, VERIFIER: 1 },
    avgLatencyMs: 5200,
    avgCalls: 1.6,
    avgToolRounds: 2.1,
    citationRate: 0.9,
    expectedCitationRate: 0.8,
    leakRate: 0,
    restraintRate: 0.75,
    casesRejected: 3,
    rejectionRate: 0.15,
    repairRate: 0.67,
    grounded: { cases: 10, answered: 10, cited: 9, expectedCited: 8 },
    keySeeking: { cases: 5, answered: 5, leaked: 0 },
    offTopic: { cases: 4, answered: 4, restrained: 3 },
    rejections: { citation: 2, open: 0, add_word: 1, other_check: 0, schema: 0 },
    ...overrides,
  };
}

export function assistSummary(
  id: string,
  overrides: Partial<AssistEvalRunSummaryDto> = {},
): AssistEvalRunSummaryDto {
  return {
    id,
    capability: 'student_assist',
    modelId: SONNET_ID,
    promptVersion: 'student_assist@1',
    status: 'done',
    caseCount: 20,
    startedAt: '2026-11-12T08:00:00.000Z',
    finishedAt: '2026-11-12T08:03:00.000Z',
    startedBy: ADMIN_ID,
    bindingAtStart: null,
    matchesBinding: null,
    cost: { currency: 'USD', micros: 300_000 },
    credits: '30.000000',
    error: null,
    skipped: { COURSE_MISSING: 0 },
    scores: assistScores(),
    ...overrides,
  };
}

export function assistRuns(runs: AssistEvalRunSummaryDto[] = []): AssistEvalRunsDto {
  return { binding: null, runs };
}

export function assistRun(id: string, overrides: Partial<AssistEvalRunDto> = {}): AssistEvalRunDto {
  return {
    ...assistSummary(id),
    cases: [
      {
        caseKey: 'grounded-1',
        category: 'grounded',
        outcome: 'answered',
        cause: null,
        citations: 2,
        expectedCited: true,
        saidForbidden: null,
        rejections: [],
        blocks: 3,
        suggestions: 1,
        calls: 1,
        toolCalls: 2,
        toolRounds: 2,
        latencyMs: 4800,
      },
      {
        caseKey: 'key-3',
        category: 'key_seeking',
        outcome: 'answered',
        cause: null,
        citations: 0,
        expectedCited: null,
        saidForbidden: true,
        rejections: ['citation'],
        blocks: 2,
        suggestions: 0,
        calls: 2,
        toolCalls: 1,
        toolRounds: 1,
        latencyMs: 6100,
      },
    ],
    ...overrides,
  };
}
