import { BreakerRowDto } from '../../../api/ai/models/breaker-row-dto';
import { ModelPriceResponseDto } from '../../../api/ai/models/model-price-response-dto';
import { ModelResponseDto } from '../../../api/ai/models/model-response-dto';
import { ProviderResponseDto } from '../../../api/ai/models/provider-response-dto';
import { toMicros } from '../spend/spend-model';

/**
 * What "AI → Providers" shows (plan 90, phase 7, step 14), computed from three reads of
 * ai-service: providers, models (with the price in effect) and the breaker board. Each read
 * fails on its own; a card without models or breakers still shows the provider.
 */

export type ModelStatus = ModelResponseDto['status'];
export type Modality = ModelResponseDto['modality'];

export interface ModelRow {
  readonly model: ModelResponseDto;
  /** Null while the board is loading or failed, or when the board does not list the model. */
  readonly breaker: BreakerRowDto | null;
}

export interface ProviderCard {
  readonly provider: ProviderResponseDto;
  /** Null while the models are loading or failed. */
  readonly models: readonly ModelRow[] | null;
}

/** One card per provider in the server's order; each card holds its models in the server's order. */
export function providerCards(
  providers: readonly ProviderResponseDto[],
  models: readonly ModelResponseDto[] | null,
  board: readonly BreakerRowDto[] | null,
): ProviderCard[] {
  const breakers = new Map((board ?? []).map((b) => [b.modelId, b]));
  return providers.map((provider) => ({
    provider,
    models: models
      ? models
          .filter((m) => m.providerId === provider.id)
          .map((model) => ({ model, breaker: breakers.get(model.id) ?? null }))
      : null,
  }));
}

/** The switches the tab offers: a provider on/off, a model's status. */
export type RegistryChange =
  | { readonly kind: 'provider'; readonly providerId: string; readonly enabled: boolean }
  | { readonly kind: 'model'; readonly modelId: string; readonly status: ModelStatus };

interface BindingPair {
  primary: string | null;
  fallback: string | null;
  enabled: boolean;
}

/** The bindings as the breaker board names them: every model lists the agents that call it. */
function bindingsOf(board: readonly BreakerRowDto[]): Map<string, BindingPair> {
  const pairs = new Map<string, BindingPair>();
  for (const row of board) {
    for (const ref of row.bindings) {
      const pair = pairs.get(ref.capability) ?? { primary: null, fallback: null, enabled: false };
      pair[ref.role] = row.modelId;
      pair.enabled = ref.enabled;
      pairs.set(ref.capability, pair);
    }
  }
  return pairs;
}

/**
 * The agents a change would leave with no model that serves — what the server answers as
 * `strandedCapabilities` after the change, worked out before it so the dialog can warn. Mirrors
 * the server's rule: a switched-on binding on an affected model whose primary and fallback both
 * fail to serve (missing, `disabled`, provider off or not configured). Breakers are not counted.
 * Switching on never strands anything. The server's answer stays the word that counts.
 */
export function strandedBy(
  change: RegistryChange,
  providers: readonly ProviderResponseDto[],
  models: readonly ModelResponseDto[],
  board: readonly BreakerRowDto[],
): string[] {
  if (change.kind === 'provider' ? change.enabled : change.status !== 'disabled') return [];

  const providerById = new Map(providers.map((p) => [p.id, p]));
  const modelById = new Map(models.map((m) => [m.id, m]));

  const serves = (modelId: string | null): boolean => {
    if (!modelId) return false;
    const model = modelById.get(modelId);
    if (!model) return false;
    const status =
      change.kind === 'model' && change.modelId === modelId ? change.status : model.status;
    if (status === 'disabled') return false;
    const provider = providerById.get(model.providerId);
    if (!provider) return false;
    const enabled =
      change.kind === 'provider' && change.providerId === provider.id
        ? change.enabled
        : provider.enabled;
    return enabled && provider.configured;
  };

  const affected = (modelId: string | null): boolean => {
    if (!modelId) return false;
    if (change.kind === 'model') return modelId === change.modelId;
    return modelById.get(modelId)?.providerId === change.providerId;
  };

  return [...bindingsOf(board)]
    .filter(
      ([, pair]) =>
        pair.enabled &&
        (affected(pair.primary) || affected(pair.fallback)) &&
        !serves(pair.primary) &&
        !serves(pair.fallback),
    )
    .map(([capability]) => capability)
    .sort();
}

/** One line of a price: what is billed and how much, in micros of the price's currency. */
export interface PriceLine {
  readonly unit: 'input' | 'output' | 'cacheRead' | 'cacheWrite' | 'audioHour' | 'millionChars';
  readonly micros: number;
}

/**
 * The lines of a price a model's modality is billed by: tokens for a language model (cache lines
 * only when priced), audio hours for speech, characters for synthesis.
 */
export function priceLines(price: ModelPriceResponseDto, modality: Modality): PriceLine[] {
  switch (modality) {
    case 'speech':
      return [{ unit: 'audioHour', micros: toMicros(price.audioPerHour) }];
    case 'tts':
      return [{ unit: 'millionChars', micros: toMicros(price.charsPerMillion) }];
    default: {
      const lines: PriceLine[] = [
        { unit: 'input', micros: toMicros(price.inputPerMtok) },
        { unit: 'output', micros: toMicros(price.outputPerMtok) },
      ];
      const cacheRead = toMicros(price.cacheReadPerMtok);
      const cacheWrite = toMicros(price.cacheWritePerMtok);
      if (cacheRead > 0) lines.push({ unit: 'cacheRead', micros: cacheRead });
      if (cacheWrite > 0) lines.push({ unit: 'cacheWrite', micros: cacheWrite });
      return lines;
    }
  }
}

/** Why the test button is not offered for a model; null when it may run. */
export type TestBlock = 'notLlm' | 'notConfigured' | null;

/**
 * The server tests language models only, and not on a provider without its key (422). A
 * switched-off provider or a disabled model can be tested — that is what the test is for.
 */
export function testBlock(model: ModelResponseDto, provider: ProviderResponseDto): TestBlock {
  if (model.modality !== 'llm') return 'notLlm';
  if (!provider.configured) return 'notConfigured';
  return null;
}

/** A breaker worth a reset: open, or counting failures. */
export function canReset(breaker: BreakerRowDto | null): boolean {
  return !!breaker && (breaker.state === 'open' || (breaker.recentFailures ?? 0) > 0);
}
