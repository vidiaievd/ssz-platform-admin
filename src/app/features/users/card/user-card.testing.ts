import { AdminUserDetail } from '../../../core/auth/admin-users.api';

/** Test helpers of the user card; used by specs only. */
export const USER_ID = '5e0c1b2a-0000-4000-8000-000000000042';

/** A learner's card as auth answers it: one open web session, nothing else going on. */
export function userDetail(overrides: Partial<AdminUserDetail> = {}): AdminUserDetail {
  return {
    id: USER_ID,
    email: 'kari@example.no',
    roles: ['student'],
    adminLevel: null,
    emailVerified: true,
    twoFactorEnabled: false,
    blockedAt: null,
    lockedUntil: null,
    deletionRequestedAt: null,
    purgeAt: null,
    createdAt: '2026-03-05T10:00:00.000Z',
    lastLoginAt: '2026-11-17T08:30:00.000Z',
    block: null,
    failedLogins: { count: 0, lastAt: null, lockedUntil: null },
    mfaCodes: { available: true, failures: 0, lockedUntil: null },
    backupCodesLeft: 0,
    sessions: [
      {
        clientType: 'web',
        active: 1,
        lastIssuedAt: '2026-11-17T08:30:00.000Z',
        recent: [
          {
            issuedAt: '2026-11-17T08:30:00.000Z',
            expiresAt: '2026-11-24T08:30:00.000Z',
            deviceInfo: 'Firefox on Linux',
          },
        ],
      },
      { clientType: 'mobile', active: 0, lastIssuedAt: null, recent: [] },
      { clientType: 'admin', active: 0, lastIssuedAt: null, recent: [] },
    ],
    ...overrides,
  };
}
