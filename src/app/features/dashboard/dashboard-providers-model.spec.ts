import {
  anthropic,
  board,
  breaker,
  flash,
  google,
  openai,
  provider,
  providers,
  sonnet,
} from '../ai/providers/provider-fixtures';
import { providerAttention, providerChips } from './dashboard-providers-model';

describe('providerChips', () => {
  it('ranks an open breaker over a missing key over a switch, in the server order', () => {
    const chips = providerChips(providers, board.items);
    expect(chips.map((c) => [c.code, c.health, c.openBreakers, c.used])).toEqual([
      ['anthropic', 'breakerOpen', 1, true],
      ['google', 'ok', 0, true],
      // OpenAI is off and keyless: the key is named, nobody uses it.
      ['openai', 'noKey', 0, false],
    ]);
  });

  it('knows neither breakers nor use without the board', () => {
    const chips = providerChips([anthropic, provider('p-x', 'x', { enabled: false })], null);
    expect(chips.map((c) => [c.health, c.openBreakers, c.used])).toEqual([
      ['ok', null, null],
      ['off', null, null],
    ]);
  });
});

describe('providerAttention', () => {
  it('lists open breakers with their enabled agents, red rows first', () => {
    const rows = providerAttention(providers, board.items);
    expect(rows[0]).toEqual({
      id: 'breaker:m-sonnet',
      kind: 'breakerOpen',
      model: 'Sonnet',
      provider: 'Anthropic',
      capabilities: ['practice', 'review_draft'],
      reopensAt: '2026-11-14T12:00:30.000Z',
    });
    // OpenAI is off and keyless, but no agent uses it: no row.
    expect(rows.some((r) => r.id === 'provider:p-o')).toBe(false);
  });

  it('flags a used provider that is off ("off" wins) or has no key', () => {
    const items = [
      breaker(sonnet, anthropic, [{ capability: 'practice', role: 'primary', enabled: true }]),
      breaker(flash, google, [
        { capability: 'review_draft', role: 'fallback', enabled: true },
        { capability: 'voice_review', role: 'primary', enabled: false },
      ]),
    ];
    const rows = providerAttention(
      [
        { ...anthropic, enabled: false, configured: false },
        { ...google, configured: false },
        openai,
      ],
      items,
    );
    expect(rows).toEqual([
      {
        id: 'provider:p-a',
        kind: 'providerOff',
        provider: 'Anthropic',
        capabilities: ['practice'],
      },
      {
        id: 'provider:p-g',
        kind: 'providerNoKey',
        provider: 'Google',
        // A switched-off binding does not make the provider used.
        capabilities: ['review_draft'],
      },
    ]);
  });

  it('raises nothing when every used provider serves and no breaker is open', () => {
    const calm = board.items.map((r) => ({ ...r, state: 'closed' as const }));
    expect(providerAttention([anthropic, google, openai], calm)).toEqual([]);
  });
});
