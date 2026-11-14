import { BindingChangeResponseDto } from '../../../api/ai/models/binding-change-response-dto';
import { BindingResponseDto } from '../../../api/ai/models/binding-response-dto';
import { BindingSettingsDto } from '../../../api/ai/models/binding-settings-dto';
import { CapabilityBindingResponseDto } from '../../../api/ai/models/capability-binding-response-dto';
import { ModelResponseDto } from '../../../api/ai/models/model-response-dto';
import { ProviderResponseDto } from '../../../api/ai/models/provider-response-dto';

export type Modality = CapabilityBindingResponseDto['modality'];
export type ModelStatus = ModelResponseDto['status'];
export type ProviderRegion = ProviderResponseDto['region'];

/** A model as a row shows it. Without the registry only the id is known. */
export interface ModelRef {
  readonly id: string;
  /** Null when the registry could not be read or no longer has the model. */
  readonly model: ModelResponseDto | null;
  readonly provider: ProviderResponseDto | null;
}

export interface AgentBindingRow {
  readonly capability: string;
  readonly description: string;
  readonly modality: Modality;
  /** The capability's floor, one line per feature (`languages: nb`, `pronunciation`). */
  readonly requirements: readonly string[];
  /** Null = unbound: ai-service refuses every call of the agent. */
  readonly binding: BindingResponseDto | null;
  readonly primary: ModelRef | null;
  readonly fallback: ModelRef | null;
}

/** The registry as the screen holds it; `null` while it is loading or failed. */
export interface Registry {
  readonly models: readonly ModelResponseDto[];
  readonly providers: readonly ProviderResponseDto[];
}

export function modelRef(id: string, registry: Registry | null): ModelRef {
  const model = registry?.models.find((m) => m.id === id) ?? null;
  const provider = model
    ? (registry?.providers.find((p) => p.id === model.providerId) ?? null)
    : null;
  return { id, model, provider };
}

/** Every capability of ai-service's catalog, in its order, joined with the models it is bound to. */
export function agentBindingRows(
  capabilities: readonly CapabilityBindingResponseDto[],
  registry: Registry | null,
): AgentBindingRow[] {
  return capabilities.map((c) => ({
    capability: c.capability,
    description: c.description,
    modality: c.modality,
    requirements: formatRequirements(c.requiredFeatures),
    binding: c.binding,
    primary: c.binding ? modelRef(c.binding.primaryModelId, registry) : null,
    fallback: c.binding?.fallbackModelId ? modelRef(c.binding.fallbackModelId, registry) : null,
  }));
}

/** `{ languages: ['nb'], pronunciation: true, minAudioSeconds: 30 }` → three short lines. */
export function formatRequirements(required: object): string[] {
  return Object.entries(required)
    .filter(([, value]) => value !== false && value !== null && value !== undefined)
    .map(([key, value]) => {
      if (value === true) return key;
      if (Array.isArray(value)) return `${key}: ${value.join(', ')}`;
      return `${key}: ${String(value)}`;
    });
}

/** An option of the model pickers. */
export interface ModelOption {
  readonly id: string;
  readonly label: string;
  readonly providerCode: string;
  readonly region: ProviderRegion | null;
  readonly status: ModelStatus;
  /** Output cap of a language model; null for speech and synthesis. */
  readonly maxOutput: number | null;
}

/**
 * Models a capability may be bound to: its modality and not `disabled` (the server refuses
 * those), grouped by provider. The server checks the rest — required features, a configured
 * provider, `maxOutputTokens` — and lists what fails in its 422.
 */
export function bindableModels(modality: Modality, registry: Registry): ModelOption[] {
  return registry.models
    .filter((m) => m.modality === modality && m.status !== 'disabled')
    .map((m) => {
      const provider = registry.providers.find((p) => p.id === m.providerId) ?? null;
      return {
        id: m.id,
        label: m.displayName,
        providerCode: provider?.code ?? m.providerCode,
        region: provider?.region ?? null,
        status: m.status,
        maxOutput: 'maxOutput' in m.features ? m.features.maxOutput : null,
      };
    })
    .sort((a, b) => a.providerCode.localeCompare(b.providerCode) || a.label.localeCompare(b.label));
}

/** Fields of a binding, in the order the history lists them. */
export const BINDING_FIELDS = [
  'primaryModelId',
  'fallbackModelId',
  'enabled',
  'promptVersion',
  'maxOutputTokens',
  'timeoutMs',
  'temperature',
] as const satisfies readonly (keyof BindingSettingsDto)[];

export type BindingField = (typeof BINDING_FIELDS)[number];

export interface FieldChange {
  readonly field: BindingField;
  /** Undefined when the change created the binding. */
  readonly before: BindingSettingsDto[BindingField] | undefined;
  readonly after: BindingSettingsDto[BindingField];
}

/**
 * What one write changed. A write that created the binding lists every field; a write that
 * changed nothing (it is still recorded — the admin gave a reason) lists none.
 */
export function changedFields(change: BindingChangeResponseDto): FieldChange[] {
  const { before, after } = change;
  return BINDING_FIELDS.filter((f) => !before || before[f] !== after[f]).map((field) => ({
    field,
    before: before ? before[field] : undefined,
    after: after[field],
  }));
}
