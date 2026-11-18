import { AdminUserListItem } from '../../core/auth/admin-users.api';
import { daysUntil } from '../schools/school-lifecycle';

export type UserBadgeKind = 'blocked' | 'locked' | 'deletion' | 'unverified';

export interface UserBadge {
  readonly kind: UserBadgeKind;
  readonly severity: 'danger' | 'warn' | 'secondary';
  /** Days left to the erasure (`deletion` only); 0 once it is due — the purge job runs next. */
  readonly days?: number;
}

/**
 * What stands out about an account, most serious first: an administrator's block, a running
 * lockout after failed sign-ins, a pending deletion (with the days left), an unconfirmed e-mail.
 * No badge = active. One rule for the list, the palette and (step 7) the card.
 */
export function userBadges(
  user: Pick<
    AdminUserListItem,
    'blockedAt' | 'lockedUntil' | 'deletionRequestedAt' | 'purgeAt' | 'emailVerified'
  >,
  now: Date = new Date(),
): UserBadge[] {
  const badges: UserBadge[] = [];
  if (user.blockedAt) badges.push({ kind: 'blocked', severity: 'danger' });
  // The server sends only a lockout still running; a stale answer is checked against the clock.
  if (user.lockedUntil && new Date(user.lockedUntil).getTime() > now.getTime()) {
    badges.push({ kind: 'locked', severity: 'warn' });
  }
  if (user.deletionRequestedAt) {
    badges.push({
      kind: 'deletion',
      severity: 'warn',
      ...(user.purgeAt ? { days: daysUntil(user.purgeAt, now) } : {}),
    });
  }
  if (!user.emailVerified) badges.push({ kind: 'unverified', severity: 'secondary' });
  return badges;
}
