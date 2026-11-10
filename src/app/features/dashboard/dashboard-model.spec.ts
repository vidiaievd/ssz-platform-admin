import { attentionItems, parsePeriod, periodRange, sparkPoints } from './dashboard-model';

describe('dashboard model', () => {
  it('falls back to 30 days for an unknown period', () => {
    expect(parsePeriod('90')).toBe(90);
    expect(parsePeriod('13')).toBe(30);
    expect(parsePeriod(null)).toBe(30);
  });

  it('counts the period in UTC days, both ends inclusive', () => {
    const now = new Date('2026-11-10T23:30:00Z');
    expect(periodRange(7, now)).toEqual({ from: '2026-11-04', to: '2026-11-10' });
    // 365 days = 365 daily rows; the server allows up to 366.
    expect(periodRange(365, now).from).toBe('2025-11-11');
  });

  it('orders the queue by the end and links a school to its plan tab only', () => {
    const items = attentionItems({
      truncated: false,
      grants: [
        {
          grantId: 'g1',
          accountType: 'workspace',
          externalId: 's1',
          featureKey: 'ai.practice',
          enabled: false,
          startsAt: '2026-11-01',
          endsAt: '2026-11-15T00:00:00Z',
        },
      ],
      subscriptions: [
        {
          subscriptionId: 'u1',
          accountType: 'user',
          externalId: 'user-1',
          planCode: 'p',
          planName: 'Plus',
          planVersion: 1,
          status: 'trial',
          periodEnd: '2026-11-12T00:00:00Z',
        },
      ],
    });
    expect(items.map((i) => i.kind)).toEqual(['trialEnds', 'grantOffEnds']);
    expect(items[0].link).toBeNull();
    expect(items[1].link).toEqual(['/schools', 's1', 'plan']);
  });

  it('draws a flat series as a line and nothing for one point', () => {
    expect(sparkPoints([3], 10, 10)).toBe('');
    expect(sparkPoints([1, 1], 10, 10)).toBe('0.0,10.0 10.0,10.0');
  });
});
