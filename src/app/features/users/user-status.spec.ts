import { userBadges } from './user-status';

const NOW = new Date('2026-11-18T12:00:00Z');
const CLEAN = {
  blockedAt: null,
  lockedUntil: null,
  deletionRequestedAt: null,
  purgeAt: null,
  emailVerified: true,
};

describe('userBadges', () => {
  it('has none for an active account', () => {
    expect(userBadges(CLEAN, NOW)).toEqual([]);
  });

  it('lists every one that applies, most serious first', () => {
    expect(
      userBadges(
        {
          blockedAt: '2026-11-10T00:00:00Z',
          lockedUntil: '2026-11-18T12:10:00Z',
          deletionRequestedAt: '2026-11-01T12:00:00Z',
          purgeAt: '2026-12-01T12:00:00Z',
          emailVerified: false,
        },
        NOW,
      ).map((b) => b.kind),
    ).toEqual(['blocked', 'locked', 'deletion', 'unverified']);
  });

  it('counts the days to the erasure, rounded up, and 0 once due', () => {
    const pending = { ...CLEAN, deletionRequestedAt: '2026-11-01T00:00:00Z' };
    expect(userBadges({ ...pending, purgeAt: '2026-11-20T06:00:00Z' }, NOW)[0]).toEqual({
      kind: 'deletion',
      severity: 'warn',
      days: 2,
    });
    expect(userBadges({ ...pending, purgeAt: '2026-11-17T00:00:00Z' }, NOW)[0].days).toBe(0);
  });

  it('ignores a lockout that has already run out', () => {
    expect(userBadges({ ...CLEAN, lockedUntil: '2026-11-18T11:59:00Z' }, NOW)).toEqual([]);
  });
});
