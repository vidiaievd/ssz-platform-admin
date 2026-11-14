import { formatElapsed, formatMetric } from './eval-format';
import {
  AZURE_ID,
  GPT_ID,
  HAIKU_ID,
  PLAIN_ID,
  SONNET_ID,
  WHISPER_ID,
  evalModels,
  evalProviders,
  reviewScores,
  voiceRun,
} from './eval-fixtures';
import {
  candidates,
  countEntries,
  defaultCandidate,
  headlineMetrics,
  parseEvalSet,
  parseRunId,
  readingCaseLine,
  scoreGroups,
  setBindings,
} from './eval-sets';

describe('eval sets', () => {
  it('reads the set and the run from the URL, ignoring what is not one', () => {
    expect(parseEvalSet('voice_review')).toBe('voice_review');
    expect(parseEvalSet('nonsense')).toBe('review_draft');
    expect(parseEvalSet(null)).toBe('review_draft');
    expect(parseRunId('AAAAAAAA-aaaa-4aaa-8aaa-aaaaaaaaaaaa')).toBe(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    );
    expect(parseRunId('42')).toBeNull();
  });

  it('reads a bare-object count as Record<string, number>: zeros out, largest first', () => {
    expect(countEntries({ B: 1, A: 3, Z: 0, bad: 'x' })).toEqual([
      ['A', 3],
      ['B', 1],
    ]);
    expect(countEntries(null)).toEqual([]);
  });

  it('headline columns per set, with the direction that is better', () => {
    const review = headlineMetrics('review_draft', reviewScores());
    expect(review.map((m) => [m.key, m.value, m.better])).toEqual([
      ['confirmedRecall', 0.72, 'higher'],
      ['remarkPrecision', 0.64, 'higher'],
      ['rejectedRepeatRate', 0.12, 'lower'],
      ['sentenceAgreement', 0.81, 'higher'],
    ]);
    // A running run has no scores yet: the same columns, empty.
    expect(headlineMetrics('student_assist', null).every((m) => m.value === null)).toBe(true);
  });

  it('groups every score of a finished run, and none before', () => {
    expect(scoreGroups('review_draft', null)).toEqual([]);
    const groups = scoreGroups('review_draft', reviewScores());
    expect(groups.map((g) => g.key)).toEqual(['calls', 'remarks', 'marks', 'totals']);
    const marks = groups.find((g) => g.key === 'marks')!.metrics;
    expect(marks.find((m) => m.key === 'markBias')).toMatchObject({
      value: 0.25,
      format: 'signed',
    });
  });

  it('formats shares, latency, means and empty values', () => {
    expect(formatMetric({ value: 0.725, format: 'rate' }, 'en')).toBe('72.5%');
    expect(formatMetric({ value: 2350, format: 'ms' }, 'en')).toBe('2,350 ms');
    expect(formatMetric({ value: 840_000, format: 'ms' }, 'en')).toBe('840 s');
    expect(formatMetric({ value: 0.25, format: 'signed' }, 'en')).toBe('+0.25');
    expect(formatMetric({ value: null, format: 'rate' }, 'en')).toBe('—');
    expect(formatElapsed('2026-11-14T10:00:00Z', '2026-11-14T10:04:30Z')).toBe('4 min 30 s');
  });

  it('binds a text set to one agent and the voice set to both voice agents', () => {
    expect(setBindings('student_assist', { binding: null, runs: [] })).toEqual([
      { capability: 'student_assist', binding: null },
    ]);
    const voice = setBindings('voice_review', {
      bindings: {
        voice_review: { primaryModelId: AZURE_ID, fallbackModelId: null, promptVersion: '-' },
      },
      runs: [],
    });
    expect(voice.map((b) => [b.capability, b.binding?.primaryModelId ?? null])).toEqual([
      ['voice_review', AZURE_ID],
      ['voice_review_pronunciation', null],
    ]);
  });

  it('lists candidates of the modality: no key or a missing feature cannot be picked', () => {
    const review = candidates('review_draft', evalModels, evalProviders, false);
    expect(review.map((c) => [c.model.id, c.block])).toEqual([
      [HAIKU_ID, null],
      [PLAIN_ID, 'lacksFeatures'],
      [SONNET_ID, null],
      [GPT_ID, 'notConfigured'],
    ]);
    expect(review.find((c) => c.model.id === PLAIN_ID)!.lacking).toEqual([
      'structuredOutput json_mode (has none)',
    ]);

    // The assistant needs tools too: Haiku (deprecated, still a candidate) has none.
    const assist = candidates('student_assist', evalModels, evalProviders, false);
    expect(assist.find((c) => c.model.id === HAIKU_ID)!.lacking).toEqual(['tools']);

    // Voice: speech models only; pronunciation rules out Whisper.
    const voice = candidates('voice_review', evalModels, evalProviders, true);
    expect(voice.map((c) => [c.model.id, c.block])).toEqual([
      [AZURE_ID, null],
      [WHISPER_ID, 'lacksFeatures'],
    ]);

    // Without the providers read, keys are not judged.
    const blind = candidates('review_draft', evalModels, null, false);
    expect(blind.find((c) => c.model.id === GPT_ID)!.block).toBeNull();
  });

  it('starts the form on the bound primary model, if it can run', () => {
    const list = candidates('review_draft', evalModels, evalProviders, false);
    const bound = (id: string) => [
      {
        capability: 'review_draft',
        binding: { primaryModelId: id, fallbackModelId: null, promptVersion: 'v' },
      },
    ];
    expect(defaultCandidate(list, bound(SONNET_ID))).toBe(SONNET_ID);
    expect(defaultCandidate(list, bound(PLAIN_ID))).toBeNull();
    expect(defaultCandidate(list, [{ capability: 'review_draft', binding: null }])).toBeNull();
  });

  it('reduces a reading to counts of heard, agreed and the two kinds of disagreement', () => {
    const line = readingCaseLine(voiceRun('x').cases![0]);
    expect(line).toMatchObject({
      prompts: 4,
      heard: 3,
      agreed: 1,
      falsePass: 1,
      falseFail: 1,
      skipped: 1,
      errors: 0,
    });
  });
});
