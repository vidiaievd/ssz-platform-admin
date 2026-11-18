import { Observable, catchError, map, throwError } from 'rxjs';
import { AdminLevel } from '../../../core/auth/admin-level';
import { AdminUserDetail } from '../../../core/auth/admin-users.api';
import { ApiError } from '../../../core/auth/api-error';
import { ClientType } from '../../../core/auth/token-lifetimes.api';

/** What an administrator may do to an account from its card (plan 90, phase 6, step 8). */
export type UserActionKind =
  'block' | 'unblock' | 'unlock' | 'revokeSessions' | 'resetMfa' | 'cancelDeletion';

/** One pending action: `clientType` narrows "end sessions" to one client; none = all. */
export interface UserAction {
  readonly kind: UserActionKind;
  readonly clientType?: ClientType;
}

/**
 * The lowest level of an action, on any account and on a platform administrator's — a copy of
 * the matrix at the head of auth's `AdminUserCommands.cs` (Q9). The server checks it again,
 * knowing the target; the panel only hides what it would refuse.
 */
const LEVELS: Record<UserActionKind, { any: AdminLevel; platformAdmin: AdminLevel }> = {
  block: { any: 'admin', platformAdmin: 'super' },
  unblock: { any: 'admin', platformAdmin: 'super' },
  unlock: { any: 'support', platformAdmin: 'support' },
  revokeSessions: { any: 'support', platformAdmin: 'support' },
  resetMfa: { any: 'support', platformAdmin: 'super' },
  cancelDeletion: { any: 'admin', platformAdmin: 'admin' },
};

/** auth counts the role **or** a row of an admin level (a revoked level may leave either). */
export function isPlatformAdmin(user: Pick<AdminUserDetail, 'roles' | 'adminLevel'>): boolean {
  return user.roles.includes('platform_admin') || user.adminLevel !== null;
}

export function actionLevel(
  kind: UserActionKind,
  user: Pick<AdminUserDetail, 'roles' | 'adminLevel'>,
): AdminLevel {
  const levels = LEVELS[kind];
  return isPlatformAdmin(user) ? levels.platformAdmin : levels.any;
}

/**
 * The actions that would change something on this account now; an action without an effect is
 * not offered (the server would answer 409 `NOTHING_TO_CHANGE`). Unlock covers the sign-in
 * lockout and wrong-password count and the two-factor code count; a code count Redis could not
 * read still offers it (the server tells). A reset of two-factor sign-in is offered while it is
 * on or backup codes are left (a secret set up but never confirmed is not on the card — the
 * server clears it too when it resets).
 */
export function applicableActions(
  user: AdminUserDetail,
  now: Date = new Date(),
): ReadonlySet<UserActionKind> {
  const actions = new Set<UserActionKind>();
  actions.add(user.blockedAt ? 'unblock' : 'block');
  const lockRunning =
    !!user.failedLogins.lockedUntil && new Date(user.failedLogins.lockedUntil) > now;
  const codes = user.mfaCodes;
  if (
    lockRunning ||
    user.failedLogins.count > 0 ||
    !codes.available ||
    codes.failures > 0 ||
    !!codes.lockedUntil
  ) {
    actions.add('unlock');
  }
  if (user.sessions.some((s) => s.active > 0)) actions.add('revokeSessions');
  if (user.twoFactorEnabled || user.backupCodesLeft > 0) actions.add('resetMfa');
  if (user.deletionRequestedAt) actions.add('cancelDeletion');
  return actions;
}

/**
 * 409 `NOTHING_TO_CHANGE`: someone else got there first, or the card was stale. Not an error for
 * the administrator: the card is read again and the dialog closes (`nothingChanged: true`).
 */
export function nothingToChangeAsReread(
  reread: () => Observable<AdminUserDetail>,
): (source: Observable<AdminUserDetail>) => Observable<UserActionResult> {
  return (source) =>
    source.pipe(
      map((user): UserActionResult => ({ user, nothingChanged: false })),
      catchError((error: unknown) => {
        const e = ApiError.from(error);
        return e.status === 409 && e.code === 'NOTHING_TO_CHANGE'
          ? reread().pipe(map((user): UserActionResult => ({ user, nothingChanged: true })))
          : throwError(() => error);
      }),
    );
}

export interface UserActionResult {
  /** The card as it is now. */
  readonly user: AdminUserDetail;
  /** The server changed nothing (409); the card was read again. */
  readonly nothingChanged: boolean;
}
