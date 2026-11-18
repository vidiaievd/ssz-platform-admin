import { BindingResponseDto } from '../../../api/ai/models/binding-response-dto';
import { CapabilityBindingResponseDto } from '../../../api/ai/models/capability-binding-response-dto';
import { ReviewGateDto } from '../../../api/analytics/models/review-gate-dto';
import { ReviewGateGroupDto } from '../../../api/analytics/models/review-gate-group-dto';

/** Test data of analytics' `GET admin/ai/review-gate` and ai-service's `GET admin/ai/bindings`. */

export const thresholds = { minDrafts: 100, minKept: 0.85, maxDiscarded: 0.1 };

export function gateGroup(
  templateCode: string | null,
  modelId: string | null,
  remarks: { accepted: number; edited: number; discarded: number; untouched: number },
  overrides: Partial<ReviewGateGroupDto> = {},
): ReviewGateGroupDto {
  const total = remarks.accepted + remarks.edited + remarks.discarded + remarks.untouched;
  const share = (n: number) => (total === 0 ? null : Math.round((n / total) * 10_000) / 10_000);
  return {
    templateCode,
    modelId,
    drafts: 0,
    remarks: { ...remarks, total },
    keptRate: share(remarks.accepted + remarks.edited),
    discardedRate: share(remarks.discarded),
    direct: {
      reviews: 0,
      disputes: 0,
      disputeRate: null,
      teacherVerdicts: 0,
      overturned: 0,
      overturnRate: null,
    },
    verdict: 'insufficient',
    passed: false,
    ...overrides,
  };
}

/**
 * Four rows: short_answer passes on Sonnet (the review_direct model), translate fails on it
 * (too much thrown out), translate on Flash has too few drafts, and old rows without a template.
 */
export function gateResponse(overrides: Partial<ReviewGateDto> = {}): ReviewGateDto {
  return {
    from: null,
    to: null,
    thresholds,
    groups: [
      gateGroup(
        'short_answer',
        'm-sonnet',
        { accepted: 80, edited: 10, discarded: 8, untouched: 2 },
        {
          drafts: 120,
          verdict: 'passed',
          passed: true,
          direct: {
            reviews: 30,
            disputes: 2,
            disputeRate: 0.0667,
            teacherVerdicts: 4,
            overturned: 1,
            overturnRate: 0.25,
          },
        },
      ),
      gateGroup(
        'translate',
        'm-sonnet',
        { accepted: 60, edited: 25, discarded: 15, untouched: 0 },
        { drafts: 140, verdict: 'failed' },
      ),
      gateGroup(
        'translate',
        'm-flash',
        { accepted: 9, edited: 0, discarded: 1, untouched: 0 },
        { drafts: 12, verdict: 'insufficient' },
      ),
      gateGroup(
        null,
        'm-sonnet',
        { accepted: 40, edited: 5, discarded: 5, untouched: 0 },
        { drafts: 50, verdict: 'not_recorded' },
      ),
    ],
    ...overrides,
  };
}

function binding(primaryModelId: string, fallbackModelId: string | null): BindingResponseDto {
  return {
    capability: 'review_direct',
    enabled: true,
    primaryModelId,
    fallbackModelId,
    promptVersion: 'review_draft@3',
    maxOutputTokens: 2048,
    temperature: null,
    timeoutMs: 30_000,
    updatedAt: '2026-11-01T10:00:00.000Z',
    updatedBy: 'u-admin',
    version: 3,
  };
}

export function capabilities(
  direct: BindingResponseDto | null = binding('m-sonnet', 'm-flash'),
): CapabilityBindingResponseDto[] {
  return [
    {
      capability: 'review_draft',
      description: 'Draft review',
      modality: 'llm',
      requiredFeatures: {},
      binding: { ...binding('m-haiku', null), capability: 'review_draft' },
    },
    {
      capability: 'review_direct',
      description: 'Direct review',
      modality: 'llm',
      requiredFeatures: {},
      binding: direct,
    },
  ];
}
