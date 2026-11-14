import { CapabilityBindingResponseDto } from '../../../api/ai/models/capability-binding-response-dto';
import { ReviewGateDto } from '../../../api/analytics/models/review-gate-dto';
import { ReviewGateGroupDto } from '../../../api/analytics/models/review-gate-group-dto';
import { ReviewGateThresholdsDto } from '../../../api/analytics/models/review-gate-thresholds-dto';
import { ModelRef, Registry, modelRef } from '../models/agent-binding-rows';

/**
 * The Q2 gate as "AI → Q2 gate" shows it (plan 90, §6.7, step 16; decision of plan 79, 24.10):
 * a model may review a template's work by itself (`review_direct`) once teachers settled at
 * least `minDrafts` of its drafts on that template, kept (as written or reworded) at least
 * `minKept` of its remarks and threw out at most `maxDiscarded`. The verdict is analytics'; this
 * file only marks which rows are about the model `review_direct` is bound to and which
 * threshold a row misses. Nothing is switched on here (Q6, option C).
 */

export const REVIEW_DIRECT = 'review_direct';

export type GateVerdict = ReviewGateGroupDto['verdict'];

/** The `review_direct` binding: which models the gate is about. */
export type DirectBinding =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error' }
  | { readonly kind: 'unbound' }
  | { readonly kind: 'bound'; readonly primary: ModelRef; readonly fallback: ModelRef | null };

/** Which threshold a row meets; null = not measurable (no remarks, or the template unknown). */
export interface GateChecks {
  readonly drafts: boolean;
  readonly kept: boolean | null;
  readonly discarded: boolean | null;
}

export interface GateRow {
  readonly group: ReviewGateGroupDto;
  /** Stable key of the row: template × model. */
  readonly key: string;
  readonly model: ModelRef | null;
  /** The row's model in the `review_direct` binding, or null when it is not bound there. */
  readonly role: 'primary' | 'fallback' | null;
  readonly checks: GateChecks;
}

export interface GateSummary {
  /** Templates with at least one recorded row. */
  readonly templates: number;
  /** Verdicts of the bound primary model, one per template it has a row on. */
  readonly bound: Readonly<Record<'passed' | 'failed' | 'insufficient', number>> | null;
  /** Rows folded before the template was recorded (all models). */
  readonly notRecordedDrafts: number;
}

export function directBinding(
  capabilities: readonly CapabilityBindingResponseDto[],
  registry: Registry | null,
): DirectBinding {
  const binding = capabilities.find((c) => c.capability === REVIEW_DIRECT)?.binding;
  if (!binding) return { kind: 'unbound' };
  return {
    kind: 'bound',
    primary: modelRef(binding.primaryModelId, registry),
    fallback: binding.fallbackModelId ? modelRef(binding.fallbackModelId, registry) : null,
  };
}

/**
 * Each threshold on the exact counts, as analytics decides the verdict — 0.84996 must not show
 * as meeting a gate of 0.85 although it rounds to it.
 */
export function gateChecks(group: ReviewGateGroupDto, t: ReviewGateThresholdsDto): GateChecks {
  const r = group.remarks;
  const measurable = group.templateCode !== null && r.total > 0;
  return {
    drafts: group.drafts >= t.minDrafts,
    kept: measurable ? (r.accepted + r.edited) / r.total >= t.minKept : null,
    discarded: measurable ? r.discarded / r.total <= t.maxDiscarded : null,
  };
}

function roleOf(modelId: string | null, binding: DirectBinding): GateRow['role'] {
  if (binding.kind !== 'bound' || modelId === null) return null;
  if (binding.primary.id === modelId) return 'primary';
  return binding.fallback?.id === modelId ? 'fallback' : null;
}

/** The server's rows in its order (templates by name, unrecorded last), joined with the binding. */
export function gateRows(
  gate: ReviewGateDto,
  binding: DirectBinding,
  registry: Registry | null,
): GateRow[] {
  return gate.groups.map((group) => ({
    group,
    key: JSON.stringify([group.templateCode, group.modelId]),
    model: group.modelId ? modelRef(group.modelId, registry) : null,
    role: roleOf(group.modelId, binding),
    checks: gateChecks(group, gate.thresholds),
  }));
}

export function gateSummary(rows: readonly GateRow[], binding: DirectBinding): GateSummary {
  const templates = new Set<string>();
  let notRecordedDrafts = 0;
  for (const { group } of rows) {
    if (group.templateCode === null) notRecordedDrafts += group.drafts;
    else templates.add(group.templateCode);
  }
  if (binding.kind !== 'bound')
    return { templates: templates.size, bound: null, notRecordedDrafts };
  const bound = { passed: 0, failed: 0, insufficient: 0 };
  for (const row of rows) {
    if (row.role !== 'primary' || row.group.verdict === 'not_recorded') continue;
    bound[row.group.verdict] += 1;
  }
  return { templates: templates.size, bound, notRecordedDrafts };
}

/** Rows of the bound primary model only, or all of them. */
export function visibleRows(rows: readonly GateRow[], boundOnly: boolean): readonly GateRow[] {
  return boundOnly ? rows.filter((r) => r.role === 'primary') : rows;
}
