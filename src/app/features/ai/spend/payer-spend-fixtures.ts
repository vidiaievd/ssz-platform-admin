import { AdminUsageDto } from '../../../api/analytics/models/admin-usage-dto';
import { AdminUsageItemDto } from '../../../api/analytics/models/admin-usage-item-dto';

/** Test data of analytics' `GET admin/ai/usage`, shaped like the dev stand. */

export const SCHOOL_A = '6f1c2a9e-0b7d-4e3a-9c55-1d2e3f4a5b6c';
export const SCHOOL_B = '0a1b2c3d-4e5f-5a6b-8c7d-9e0f1a2b3c4d';
export const LEARNER = '11111111-2222-4333-8444-555555555555';

const tokens = (input = 0, output = 0) => ({ input, output, cacheRead: 0, cacheWrite: 0 });

function item(overrides: Partial<AdminUsageItemDto>): AdminUsageItemDto {
  return { calls: 0, credits: '0.000000', unpricedCalls: 0, tokens: tokens(), ...overrides };
}

const total = {
  calls: 1201,
  credits: '796.163000',
  unpricedCalls: 4,
  tokens: tokens(900_000, 120_000),
};

export function payersResponse(overrides: Partial<AdminUsageDto> = {}): AdminUsageDto {
  return {
    from: '2026-10-16',
    to: '2026-11-14',
    groupBy: 'payer',
    payerType: null,
    total,
    payers: 6,
    items: [
      item({
        payerType: 'workspace',
        payerId: SCHOOL_A,
        calls: 600,
        credits: '398.081500',
        tokens: tokens(500_000, 60_000),
      }),
      item({
        payerType: 'user',
        payerId: LEARNER,
        calls: 300,
        credits: '199.040750',
        unpricedCalls: 4,
        tokens: tokens(200_000, 30_000),
      }),
      item({ payerType: 'workspace', payerId: SCHOOL_B, calls: 200, credits: '100.000000' }),
    ],
    others: {
      payers: 3,
      calls: 101,
      credits: '99.040750',
      unpricedCalls: 0,
      tokens: tokens(200_000, 30_000),
    },
    ...overrides,
  };
}

export function capabilitiesResponse(): AdminUsageDto {
  return {
    from: '2026-10-16',
    to: '2026-11-14',
    groupBy: 'capability',
    payerType: null,
    total,
    items: [
      item({ capability: 'review_draft', calls: 700, credits: '597.122250' }),
      item({ capability: 'student_assist', calls: 501, credits: '199.040750' }),
    ],
  };
}

export function weeksResponse(): AdminUsageDto {
  return {
    from: '2026-10-16',
    to: '2026-11-14',
    groupBy: 'week',
    payerType: null,
    total,
    items: [
      item({ week: '2026-W42', from: '2026-10-16', to: '2026-10-18' }),
      item({
        week: '2026-W43',
        from: '2026-10-19',
        to: '2026-10-25',
        calls: 1000,
        credits: '600.000000',
      }),
      item({
        week: '2026-W44',
        from: '2026-10-26',
        to: '2026-11-01',
        calls: 201,
        credits: '196.163000',
      }),
    ],
  };
}
