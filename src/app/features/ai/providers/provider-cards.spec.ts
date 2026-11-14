import { canReset, priceLines, providerCards, strandedBy, testBlock } from './provider-cards';
import {
  anthropic,
  azureSpeech,
  board,
  flash,
  google,
  haiku,
  models,
  openai,
  providers,
  sonnet,
} from './provider-fixtures';

describe('providerCards', () => {
  it('puts each model under its provider and joins its breaker, in the server order', () => {
    const cards = providerCards(providers, models, board.items);
    expect(cards.map((c) => c.provider.code)).toEqual(['anthropic', 'google', 'openai']);
    expect(cards[0].models?.map((r) => r.model.id)).toEqual(['m-sonnet', 'm-haiku']);
    expect(cards[0].models?.[0].breaker?.state).toBe('open');
    expect(cards[1].models?.map((r) => r.model.id)).toEqual(['m-flash', 'm-speech']);
    expect(cards[2].models).toEqual([]);
  });

  it('keeps the providers when the models or the board are missing', () => {
    expect(providerCards(providers, null, board.items).every((c) => c.models === null)).toBe(true);
    const cards = providerCards(providers, models, null);
    expect(cards[0].models?.every((r) => r.breaker === null)).toBe(true);
  });
});

describe('strandedBy', () => {
  const run = (change: Parameters<typeof strandedBy>[0], p = providers, m = models) =>
    strandedBy(change, p, m, board.items);

  it('switching Anthropic off strands what has no other provider to fall to', () => {
    // review_draft falls to Gemini Flash; practice (Sonnet → Haiku) and diagnostic (Haiku) do not.
    expect(run({ kind: 'provider', providerId: 'p-a', enabled: false })).toEqual([
      'diagnostic',
      'practice',
    ]);
  });

  it('disabling one model strands only the bindings it leaves with nothing', () => {
    expect(run({ kind: 'model', modelId: 'm-sonnet', status: 'disabled' })).toEqual([]);
    expect(run({ kind: 'model', modelId: 'm-haiku', status: 'disabled' })).toEqual(['diagnostic']);
  });

  it('counts a fallback that already does not serve', () => {
    const flashOff = models.map((m) =>
      m.id === flash.id ? { ...flash, status: 'disabled' as const } : m,
    );
    expect(
      run({ kind: 'model', modelId: 'm-sonnet', status: 'disabled' }, providers, flashOff),
    ).toEqual(['review_draft']);
  });

  it('counts a fallback whose provider has no key', () => {
    const googleNoKey = [anthropic, { ...google, configured: false }, openai];
    expect(run({ kind: 'model', modelId: 'm-sonnet', status: 'disabled' }, googleNoKey)).toEqual([
      'review_draft',
    ]);
  });

  it('skips switched-off bindings and never strands on switching on or deprecating', () => {
    expect(run({ kind: 'model', modelId: azureSpeech.id, status: 'disabled' })).toEqual([]);
    expect(run({ kind: 'provider', providerId: 'p-o', enabled: true })).toEqual([]);
    expect(run({ kind: 'model', modelId: haiku.id, status: 'deprecated' })).toEqual([]);
  });
});

describe('priceLines', () => {
  it('lists tokens for a language model, cache lines only when priced', () => {
    expect(priceLines(sonnet.currentPrice!, 'llm')).toEqual([
      { unit: 'input', micros: 3_000_000 },
      { unit: 'output', micros: 15_000_000 },
      { unit: 'cacheRead', micros: 300_000 },
    ]);
  });

  it('lists audio hours for speech and characters for synthesis', () => {
    const price = {
      ...sonnet.currentPrice!,
      audioPerHour: '1.000000',
      charsPerMillion: '16.000000',
    };
    expect(priceLines(price, 'speech')).toEqual([{ unit: 'audioHour', micros: 1_000_000 }]);
    expect(priceLines(price, 'tts')).toEqual([{ unit: 'millionChars', micros: 16_000_000 }]);
  });
});

describe('testBlock and canReset', () => {
  it('tests language models of a configured provider, even a switched-off one', () => {
    expect(testBlock(sonnet, anthropic)).toBeNull();
    expect(testBlock(sonnet, { ...anthropic, enabled: false })).toBeNull();
    expect(testBlock(sonnet, openai)).toBe('notConfigured');
    expect(testBlock(azureSpeech, google)).toBe('notLlm');
  });

  it('offers a reset for an open breaker or one counting failures, not a clean or unknown one', () => {
    const [open, counting, clean] = board.items;
    expect(canReset(open)).toBe(true);
    expect(canReset(counting)).toBe(true);
    expect(canReset(clean)).toBe(false);
    expect(canReset({ ...clean, state: 'unknown', recentFailures: null })).toBe(false);
    expect(canReset(null)).toBe(false);
  });
});
