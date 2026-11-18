import { BreakerRowDto } from '../../api/ai/models/breaker-row-dto';
import { ProviderResponseDto } from '../../api/ai/models/provider-response-dto';

/**
 * The providers strip of the dashboard and what it adds to the attention queue (plan 90,
 * phase 8, step 10), from two reads of ai-service: the providers and the breaker board.
 * "Used" means an enabled agent binding (primary or fallback) points at one of the provider's
 * models — only the board names the bindings, so without it nobody is known to be used.
 */

/** The state of one provider on the strip, worst first. */
export type ProviderHealth = 'breakerOpen' | 'noKey' | 'off' | 'ok';

export interface ProviderChip {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly health: ProviderHealth;
  /** Null when the board is not in (loading or failed). */
  readonly used: boolean | null;
  /** Open breakers among the provider's models; null without the board. */
  readonly openBreakers: number | null;
}

/** A red or yellow row of the attention queue. */
export type ProviderAttention =
  | {
      readonly id: string;
      readonly kind: 'breakerOpen';
      readonly model: string;
      readonly provider: string;
      /** The agents that call the model (enabled bindings only), sorted. */
      readonly capabilities: readonly string[];
      readonly reopensAt: string | null;
    }
  | {
      readonly id: string;
      readonly kind: 'providerOff' | 'providerNoKey';
      readonly provider: string;
      readonly capabilities: readonly string[];
    };

/** Enabled agents per provider id, from the board's model rows. */
function agentsByProvider(board: readonly BreakerRowDto[]): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const row of board) {
    const set = out.get(row.provider.id) ?? new Set<string>();
    for (const ref of row.bindings) if (ref.enabled) set.add(ref.capability);
    out.set(row.provider.id, set);
  }
  return out;
}

const enabledAgents = (row: BreakerRowDto) =>
  [...new Set(row.bindings.filter((b) => b.enabled).map((b) => b.capability))].sort();

/**
 * One chip per provider in the server's order. An open breaker outranks a missing key, which
 * outranks a switched-off provider: the first is what fails calls right now. An unused provider
 * that is off or keyless is still shown so, only it raises nothing in the queue.
 */
export function providerChips(
  providers: readonly ProviderResponseDto[],
  board: readonly BreakerRowDto[] | null,
): ProviderChip[] {
  const agents = board ? agentsByProvider(board) : null;
  return providers.map((p) => {
    const openBreakers = board
      ? board.filter((r) => r.provider.id === p.id && r.state === 'open').length
      : null;
    const health: ProviderHealth =
      (openBreakers ?? 0) > 0 ? 'breakerOpen' : !p.configured ? 'noKey' : !p.enabled ? 'off' : 'ok';
    return {
      id: p.id,
      code: p.code,
      name: p.displayName,
      health,
      used: agents ? (agents.get(p.id)?.size ?? 0) > 0 : null,
      openBreakers,
    };
  });
}

/**
 * Rows for the attention queue: every open breaker (red), then every used provider that is
 * switched off or has no key (yellow; "off" wins when both). Needs both reads: without the
 * board nothing is known to be used, without the providers the key is unknown.
 */
export function providerAttention(
  providers: readonly ProviderResponseDto[],
  board: readonly BreakerRowDto[],
): ProviderAttention[] {
  const agents = agentsByProvider(board);
  const breakers: ProviderAttention[] = board
    .filter((r) => r.state === 'open')
    .map((r) => ({
      id: `breaker:${r.modelId}`,
      kind: 'breakerOpen' as const,
      model: r.displayName,
      provider: r.provider.displayName,
      capabilities: enabledAgents(r),
      reopensAt: r.reopensAt,
    }));
  const flagged: ProviderAttention[] = providers.flatMap((p) => {
    const used = [...(agents.get(p.id) ?? [])].sort();
    if (used.length === 0 || (p.enabled && p.configured)) return [];
    return [
      {
        id: `provider:${p.id}`,
        kind: p.enabled ? ('providerNoKey' as const) : ('providerOff' as const),
        provider: p.displayName,
        capabilities: used,
      },
    ];
  });
  return [...breakers, ...flagged];
}
