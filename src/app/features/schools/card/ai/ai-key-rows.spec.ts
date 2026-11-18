import { PayerFeatureUsageDto } from '../../../../api/ai/models/payer-feature-usage-dto';
import { GrantResponseDto } from '../../../../api/subscription/models/grant-response-dto';
import { aiKeyRows, formatCredits, usedPercent } from './ai-key-rows';

function usage(overrides: Partial<PayerFeatureUsageDto> = {}): PayerFeatureUsageDto {
  return {
    feature: 'ai.practice',
    enabled: true,
    used: '120.500000',
    total: '500',
    periodEnd: '2026-12-01T00:00:00.000Z',
    limits: {},
    ...overrides,
  };
}

function grant(overrides: Partial<GrantResponseDto> = {}): GrantResponseDto {
  return {
    id: 'g-1',
    featureKey: 'ai.practice',
    enabled: true,
    monthlyCredits: null,
    limits: {},
    startsAt: '2026-11-01T00:00:00.000Z',
    endsAt: '2026-12-15T00:00:00.000Z',
    state: 'active',
    reason: 'Pilot',
    createdAt: '2026-11-01T00:00:00.000Z',
    createdBy: 'admin-1',
    revokedAt: null,
    revokedBy: null,
    ...overrides,
  };
}

const off = usage({ enabled: false, used: null, total: null, periodEnd: null });

describe('aiKeyRows', () => {
  it('reads a key the plan gives and one nothing gives', () => {
    const [on, none] = aiKeyRows([usage(), { ...off, feature: 'ai.authoring' }], []);
    expect(on).toMatchObject({ source: 'plan', action: 'switch_off', offGrant: null });
    expect(none).toMatchObject({ source: 'none', action: 'switch_on' });
  });

  it('names the grant that switches a key on, and ignores other keys', () => {
    const [row] = aiKeyRows(
      [usage()],
      [grant(), grant({ id: 'g-9', featureKey: 'ai.authoring', enabled: false })],
    );
    expect(row).toMatchObject({ source: 'grant_on', action: 'switch_off' });
  });

  it('offers revoking a switch-off: a new switch-on would change nothing', () => {
    const disabling = grant({ id: 'g-2', enabled: false });
    const [row] = aiKeyRows([off], [grant(), disabling]);
    expect(row.source).toBe('grant_off');
    expect(row.action).toBe('revoke_off');
    expect(row.offGrant).toBe(disabling);
  });

  it('shows the next scheduled grant; ended and revoked ones do not count', () => {
    const [row] = aiKeyRows(
      [usage()],
      [
        grant({ id: 'g-late', state: 'scheduled', startsAt: '2027-02-01T00:00:00.000Z' }),
        grant({
          id: 'g-soon',
          state: 'scheduled',
          enabled: false,
          startsAt: '2027-01-01T00:00:00.000Z',
        }),
        grant({ id: 'g-old', state: 'revoked', enabled: false }),
        grant({ id: 'g-ended', state: 'ended' }),
      ],
    );
    expect(row.source).toBe('plan');
    expect(row.scheduled?.id).toBe('g-soon');
  });

  it('without the grants keeps the source unknown and offers only a safe switch-off', () => {
    const [on, none] = aiKeyRows([usage(), off], null);
    expect(on).toMatchObject({ source: null, action: 'switch_off' });
    expect(none).toMatchObject({ source: null, action: null });
  });

  it('marks spending beyond the period', () => {
    expect(aiKeyRows([usage({ used: '520.1', total: '500' })], [])[0].overLimit).toBe(true);
    expect(aiKeyRows([usage({ total: null })], [])[0].overLimit).toBe(false);
  });
});

describe('formatCredits / usedPercent', () => {
  it('formats in the panel language with two decimals at most', () => {
    expect(formatCredits('380.587000', 'en')).toBe('380.59');
    expect(formatCredits('1000', 'en')).toBe('1,000');
    expect(formatCredits(null, 'en')).toBe('');
  });

  it('caps the bar and has none when unmetered', () => {
    expect(usedPercent(usage())).toBe(24);
    expect(usedPercent(usage({ used: '900' }))).toBe(100);
    expect(usedPercent(usage({ total: null }))).toBeNull();
    expect(usedPercent(usage({ total: '0', used: '0' }))).toBe(0);
  });
});
