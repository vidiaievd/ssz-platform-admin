import { AssistEvalRunSummaryDto } from '../../../api/ai/models/assist-eval-run-summary-dto';
import { AssistRunScoresDto } from '../../../api/ai/models/assist-run-scores-dto';
import { BindingRefDto } from '../../../api/ai/models/binding-ref-dto';
import { EvalRunSummaryDto } from '../../../api/ai/models/eval-run-summary-dto';
import { ModelFeaturesDto } from '../../../api/ai/models/model-features-dto';
import { ModelResponseDto } from '../../../api/ai/models/model-response-dto';
import { ProviderResponseDto } from '../../../api/ai/models/provider-response-dto';
import { ReadingCaseResultDto } from '../../../api/ai/models/reading-case-result-dto';
import { ReadingRunScoresDto } from '../../../api/ai/models/reading-run-scores-dto';
import { RunScoresDto } from '../../../api/ai/models/run-scores-dto';
import { SpeechFeaturesDto } from '../../../api/ai/models/speech-features-dto';
import { VoiceEvalRunSummaryDto } from '../../../api/ai/models/voice-eval-run-summary-dto';

/**
 * The three eval sets of ai-service (plans 79, 82, 83), one sub-tab each. A set is measured
 * against one or two agents' bindings; a run is a candidate model (and, for text agents, a
 * prompt version) on that set.
 */
export const EVAL_SETS = ['review_draft', 'voice_review', 'student_assist'] as const;

export type EvalSet = (typeof EVAL_SETS)[number];

export const DEFAULT_EVAL_SET: EvalSet = 'review_draft';

export function parseEvalSet(raw: string | null): EvalSet {
  return (EVAL_SETS as readonly string[]).includes(raw ?? '') ? (raw as EvalSet) : DEFAULT_EVAL_SET;
}

/** A run id in the URL is a UUID; anything else is ignored rather than sent (the server 400s). */
export function parseRunId(raw: string | null): string | null {
  return raw && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)
    ? raw.toLowerCase()
    : null;
}

/** How many runs the list asks for (the server caps at 100). */
export const EVAL_RUNS_LIMIT = 50;

/** Set size of the review and voice sets: the server takes 1–500, 100 by default. */
export const EVAL_SET_SIZE = { min: 1, max: 500, default: 100 } as const;

/** What the run form asks for, per set. */
export const EVAL_FORM: Record<
  EvalSet,
  { readonly promptVersion: boolean; readonly limit: boolean; readonly pronunciation: boolean }
> = {
  review_draft: { promptVersion: true, limit: true, pronunciation: false },
  voice_review: { promptVersion: false, limit: true, pronunciation: true },
  student_assist: { promptVersion: true, limit: false, pronunciation: false },
};

export type EvalSummaryDto = EvalRunSummaryDto | VoiceEvalRunSummaryDto | AssistEvalRunSummaryDto;

// ---------------------------------------------------------------------------------------------
// Metrics

/** How a number reads: a share, milliseconds, a plain count, a signed mean, levels of a rubric. */
export type MetricFormat = 'rate' | 'ms' | 'count' | 'signed' | 'levels';

export interface Metric {
  /** Translation key under `ai.evals.metric`. */
  readonly key: string;
  readonly value: number | null;
  readonly format: MetricFormat;
  /** Which way is better; null when neither (a count, a bias). */
  readonly better: 'higher' | 'lower' | null;
}

const rate = (
  key: string,
  value: number | null,
  better: 'higher' | 'lower' = 'higher',
): Metric => ({
  key,
  value,
  format: 'rate',
  better,
});
const count = (key: string, value: number | null): Metric => ({
  key,
  value,
  format: 'count',
  better: null,
});
const ms = (key: string, value: number | null): Metric => ({
  key,
  value,
  format: 'ms',
  better: 'lower',
});

/** The columns the runs table compares side by side. */
export function headlineMetrics(set: EvalSet, scores: unknown): Metric[] {
  switch (set) {
    case 'review_draft': {
      const s = scores as RunScoresDto | null;
      return [
        rate('confirmedRecall', s?.confirmedRecall ?? null),
        rate('remarkPrecision', s?.remarkPrecision ?? null),
        rate('rejectedRepeatRate', s?.rejectedRepeatRate ?? null, 'lower'),
        rate('sentenceAgreement', s?.sentenceAgreement ?? null),
      ];
    }
    case 'voice_review': {
      const s = scores as ReadingRunScoresDto | null;
      return [
        rate('agreement', s?.agreement ?? null),
        rate('falsePassRate', s?.falsePassRate ?? null, 'lower'),
        rate('falseFailRate', s?.falseFailRate ?? null, 'lower'),
        rate('readingAgreement', s?.readingAgreement ?? null),
      ];
    }
    case 'student_assist': {
      const s = scores as AssistRunScoresDto | null;
      return [
        rate('expectedCitationRate', s?.expectedCitationRate ?? null),
        rate('leakRate', s?.leakRate ?? null, 'lower'),
        rate('restraintRate', s?.restraintRate ?? null),
        rate('silentRate', s?.silentRate ?? null, 'lower'),
      ];
    }
  }
}

/** Every score of a finished run, grouped as the card shows them. */
export interface MetricGroup {
  /** Translation key under `ai.evals.group`. */
  readonly key: string;
  readonly metrics: readonly Metric[];
}

export function scoreGroups(set: EvalSet, scores: unknown): MetricGroup[] {
  if (!scores) return [];
  switch (set) {
    case 'review_draft': {
      const s = scores as RunScoresDto;
      const t = s.totals;
      return [
        {
          key: 'calls',
          metrics: [
            count('cases', s.cases),
            count('ok', s.ok),
            count('invalidResponse', s.invalidResponse),
            count('error', s.error),
            ms('avgLatencyMs', s.avgLatencyMs),
          ],
        },
        {
          key: 'remarks',
          metrics: [
            rate('confirmedRecall', s.confirmedRecall),
            rate('confirmedRecallAnyAspect', s.confirmedRecallAnyAspect),
            rate('remarkPrecision', s.remarkPrecision),
            rate('rejectedRepeatRate', s.rejectedRepeatRate, 'lower'),
            {
              key: 'remarksPerCase',
              value: s.remarksPerCase,
              format: 'levels',
              better: null,
            },
            rate('sentenceAgreement', s.sentenceAgreement),
          ],
        },
        {
          key: 'marks',
          metrics: [
            rate('markAgreement', s.markAgreement),
            {
              key: 'markMeanAbsDelta',
              value: s.markMeanAbsDelta,
              format: 'levels',
              better: 'lower',
            },
            { key: 'markBias', value: s.markBias, format: 'signed', better: null },
            count('marksCompared', t.marksCompared),
            count('marksMissing', t.marksMissing),
          ],
        },
        {
          key: 'totals',
          metrics: [
            count('confirmed', t.confirmed),
            count('confirmedFound', t.confirmedFound),
            count('rejected', t.rejected),
            count('rejectedRepeated', t.rejectedRepeated),
            count('remarks', t.remarks),
            count('remarksOnConfirmed', t.remarksOnConfirmed),
            count('sentences', t.sentences),
            count('sentencesAgreed', t.sentencesAgreed),
          ],
        },
      ];
    }
    case 'voice_review': {
      const s = scores as ReadingRunScoresDto;
      return [
        {
          key: 'calls',
          metrics: [
            count('cases', s.cases),
            count('casesHeard', s.casesHeard),
            count('prompts', s.prompts),
            count('heard', s.heard),
            count('promptsSkipped', s.skipped),
            count('error', s.error),
            ms('avgLatencyMs', s.avgLatencyMs),
            { key: 'audioMs', value: s.audioMs, format: 'ms', better: null },
          ],
        },
        {
          key: 'verdicts',
          metrics: [
            rate('agreement', s.agreement),
            count('agreed', s.agreed),
            rate('falsePassRate', s.falsePassRate, 'lower'),
            count('falsePass', s.falsePass),
            rate('falseFailRate', s.falseFailRate, 'lower'),
            count('falseFail', s.falseFail),
            rate('readingAgreement', s.readingAgreement),
          ],
        },
        {
          key: 'percent',
          metrics: [
            {
              key: 'meanPercentApproved',
              value: s.meanPercentApproved,
              format: 'levels',
              better: null,
            },
            {
              key: 'meanPercentFailed',
              value: s.meanPercentFailed,
              format: 'levels',
              better: null,
            },
          ],
        },
      ];
    }
    case 'student_assist': {
      const s = scores as AssistRunScoresDto;
      return [
        {
          key: 'calls',
          metrics: [
            count('cases', s.cases),
            count('answered', s.answered),
            count('silent', s.silent),
            rate('silentRate', s.silentRate, 'lower'),
            ms('avgLatencyMs', s.avgLatencyMs),
            { key: 'avgCalls', value: s.avgCalls, format: 'levels', better: null },
            { key: 'avgToolRounds', value: s.avgToolRounds, format: 'levels', better: null },
          ],
        },
        {
          key: 'grounded',
          metrics: [
            count('groundedCases', s.grounded.cases),
            rate('citationRate', s.citationRate),
            rate('expectedCitationRate', s.expectedCitationRate),
          ],
        },
        {
          key: 'keySeeking',
          metrics: [
            count('keySeekingCases', s.keySeeking.cases),
            rate('leakRate', s.leakRate, 'lower'),
            count('leaked', s.keySeeking.leaked),
          ],
        },
        {
          key: 'offTopic',
          metrics: [
            count('offTopicCases', s.offTopic.cases),
            rate('restraintRate', s.restraintRate),
          ],
        },
        {
          key: 'rejections',
          metrics: [
            count('casesRejected', s.casesRejected),
            rate('rejectionRate', s.rejectionRate, 'lower'),
            rate('repairRate', s.repairRate),
            count('rejection.citation', s.rejections.citation),
            count('rejection.open', s.rejections.open),
            count('rejection.add_word', s.rejections.add_word),
            count('rejection.other_check', s.rejections.other_check),
            count('rejection.schema', s.rejections.schema),
          ],
        },
      ];
    }
  }
}

/**
 * A count object the Swagger types as a bare `{}` (`skipped`, `silentByCause`): read as
 * `Record<string, number>`, zeros and non-numbers dropped, largest first.
 */
export function countEntries(value: unknown): [string, number][] {
  if (typeof value !== 'object' || value === null) return [];
  return Object.entries(value as Record<string, unknown>)
    .filter((e): e is [string, number] => typeof e[1] === 'number' && e[1] > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

/** The voice gate (plan 82, Q5) of a finished run; null for the other sets or before the end. */
export function voiceGate(set: EvalSet, scores: unknown): ReadingRunScoresDto['gate'] | null {
  return set === 'voice_review' && scores ? (scores as ReadingRunScoresDto).gate : null;
}

// ---------------------------------------------------------------------------------------------
// Bindings

/** An agent's binding today, as the runs list answers it. */
export interface SetBinding {
  readonly capability: string;
  readonly binding: BindingRefDto | null;
}

/** The agents a set measures: one for text sets, both voice agents for the voice set. */
export const SET_CAPABILITIES: Record<EvalSet, readonly string[]> = {
  review_draft: ['review_draft'],
  voice_review: ['voice_review', 'voice_review_pronunciation'],
  student_assist: ['student_assist'],
};

export function setBindings(set: EvalSet, runs: unknown): SetBinding[] {
  const body = runs as { binding?: BindingRefDto | null; bindings?: unknown };
  if (set !== 'voice_review') {
    return [{ capability: SET_CAPABILITIES[set][0], binding: body.binding ?? null }];
  }
  const map = (
    typeof body.bindings === 'object' && body.bindings !== null ? body.bindings : {}
  ) as Record<string, BindingRefDto | null | undefined>;
  return SET_CAPABILITIES.voice_review.map((capability) => ({
    capability,
    binding: map[capability] ?? null,
  }));
}

// ---------------------------------------------------------------------------------------------
// Candidate models

/** Why a model cannot be a candidate of a set; null when it can. */
export type CandidateBlock = 'notConfigured' | 'lacksFeatures';

export interface Candidate {
  readonly model: ModelResponseDto;
  readonly block: CandidateBlock | null;
  /** What the model lacks, in the server's words (`structuredOutput json_mode`, `tools`, …). */
  readonly lacking: readonly string[];
}

const STRUCTURED_RANK: Record<ModelFeaturesDto['structuredOutput'], number> = {
  none: 0,
  json_mode: 1,
  native: 2,
};

/**
 * What a model lacks for a set — a copy of ai-service's `capabilityGaps` for the three eval
 * agents (`review_draft`: json_mode; `student_assist`: tools + json_mode; voice: word timings,
 * pronunciation when asked). The server checks again; this only keeps hopeless models out.
 */
export function lacking(model: ModelResponseDto, set: EvalSet, pronunciation: boolean): string[] {
  if (set === 'voice_review') {
    const f = model.features as SpeechFeaturesDto;
    const gaps: string[] = [];
    if (!f.wordTimings) gaps.push('wordTimings');
    if (pronunciation && !f.pronunciation) gaps.push('pronunciation');
    return gaps;
  }
  const f = model.features as ModelFeaturesDto;
  const gaps: string[] = [];
  if (STRUCTURED_RANK[f.structuredOutput] < STRUCTURED_RANK.json_mode) {
    gaps.push(`structuredOutput json_mode (has ${f.structuredOutput})`);
  }
  if (set === 'student_assist' && !f.tools) gaps.push('tools');
  return gaps;
}

/**
 * The models a set's run may name: those of its modality (llm for text agents, speech for the
 * voice set), any status — a candidate "need not be switched on". A model whose provider has no
 * key, or that lacks a feature, is listed but cannot be picked. Without the providers read, keys
 * are not judged (the server will say). Sorted by provider, then name.
 */
export function candidates(
  set: EvalSet,
  models: readonly ModelResponseDto[],
  providers: readonly ProviderResponseDto[] | null,
  pronunciation: boolean,
): Candidate[] {
  const modality = set === 'voice_review' ? 'speech' : 'llm';
  const byId = new Map((providers ?? []).map((p) => [p.id, p]));
  return models
    .filter((m) => m.modality === modality)
    .map((model) => {
      const provider = byId.get(model.providerId);
      const gaps = lacking(model, set, pronunciation);
      const block: CandidateBlock | null =
        provider && !provider.configured
          ? 'notConfigured'
          : gaps.length > 0
            ? 'lacksFeatures'
            : null;
      return { model, block, lacking: gaps };
    })
    .sort(
      (a, b) =>
        a.model.providerCode.localeCompare(b.model.providerCode) ||
        a.model.displayName.localeCompare(b.model.displayName),
    );
}

/** The model the form starts on: today's primary of the set's (first) agent, when it can run. */
export function defaultCandidate(
  list: readonly Candidate[],
  bindings: readonly SetBinding[],
): string | null {
  const primary = bindings[0]?.binding?.primaryModelId;
  const bound = list.find((c) => c.model.id === primary && c.block === null);
  return bound?.model.id ?? null;
}

// ---------------------------------------------------------------------------------------------
// Cases of a voice run

export interface ReadingCaseLine {
  readonly caseId: string;
  readonly passPercent: number;
  readonly prompts: number;
  readonly heard: number;
  readonly agreed: number;
  readonly falsePass: number;
  readonly falseFail: number;
  readonly errors: number;
  readonly skipped: number;
}

/** A reading reduced to counts: what was heard and where the machine and the teacher differ. */
export function readingCaseLine(c: ReadingCaseResultDto): ReadingCaseLine {
  let heard = 0;
  let agreed = 0;
  let falsePass = 0;
  let falseFail = 0;
  let errors = 0;
  let skipped = 0;
  for (const p of c.prompts) {
    if (p.outcome === 'error') errors++;
    else if (p.outcome === 'skipped') skipped++;
    if (p.outcome !== 'ok' || p.machinePassed === null) continue;
    heard++;
    if (p.machinePassed === p.teacherApproved) agreed++;
    else if (p.machinePassed) falsePass++;
    else falseFail++;
  }
  return {
    caseId: c.caseId,
    passPercent: c.passPercent,
    prompts: c.prompts.length,
    heard,
    agreed,
    falsePass,
    falseFail,
    errors,
    skipped,
  };
}
