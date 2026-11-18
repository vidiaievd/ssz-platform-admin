import { firstValueFrom, of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import {
  actionLevel,
  applicableActions,
  isPlatformAdmin,
  nothingToChangeAsReread,
} from './user-actions';
import { userDetail } from './user-card.testing';

const now = new Date('2026-11-18T12:00:00.000Z');

describe('user actions', () => {
  it('asks super to block, unblock or reset MFA of a platform administrator', () => {
    const learner = userDetail();
    const admin = userDetail({ roles: ['platform_admin'], adminLevel: 'support' });
    expect(actionLevel('block', learner)).toBe('admin');
    expect(actionLevel('block', admin)).toBe('super');
    expect(actionLevel('unblock', admin)).toBe('super');
    expect(actionLevel('resetMfa', learner)).toBe('support');
    expect(actionLevel('resetMfa', admin)).toBe('super');
    expect(actionLevel('unlock', admin)).toBe('support');
    expect(actionLevel('revokeSessions', admin)).toBe('support');
    expect(actionLevel('cancelDeletion', admin)).toBe('admin');
  });

  it('counts a level row without the role as a platform administrator', () => {
    expect(isPlatformAdmin({ roles: ['student'], adminLevel: 'admin' })).toBe(true);
    expect(isPlatformAdmin({ roles: ['platform_admin'], adminLevel: null })).toBe(true);
    expect(isPlatformAdmin({ roles: ['tutor'], adminLevel: null })).toBe(false);
  });

  it('offers only what would change something', () => {
    const calm = userDetail({
      sessions: [
        { clientType: 'web', active: 0, lastIssuedAt: null, recent: [] },
        { clientType: 'mobile', active: 0, lastIssuedAt: null, recent: [] },
        { clientType: 'admin', active: 0, lastIssuedAt: null, recent: [] },
      ],
    });
    expect([...applicableActions(calm, now)]).toEqual(['block']);

    const busy = userDetail({
      blockedAt: '2026-11-10T00:00:00.000Z',
      failedLogins: { count: 2, lastAt: null, lockedUntil: null },
      twoFactorEnabled: true,
      deletionRequestedAt: '2026-11-01T00:00:00.000Z',
    });
    expect([...applicableActions(busy, now)].sort()).toEqual(
      ['cancelDeletion', 'resetMfa', 'revokeSessions', 'unblock', 'unlock'].sort(),
    );
  });

  it('offers unlock for a code lockout alone, and when the code count is unknown', () => {
    const codes = userDetail({
      mfaCodes: { available: true, failures: 0, lockedUntil: '2026-11-18T12:10:00.000Z' },
    });
    expect(applicableActions(codes, now).has('unlock')).toBe(true);
    const unknown = userDetail({ mfaCodes: { available: false, failures: 0, lockedUntil: null } });
    expect(applicableActions(unknown, now).has('unlock')).toBe(true);
  });

  it('offers a reset of MFA while backup codes are left', () => {
    expect(applicableActions(userDetail({ backupCodesLeft: 3 }), now).has('resetMfa')).toBe(true);
  });

  it('reads the card again on 409 NOTHING_TO_CHANGE and passes other refusals on', async () => {
    const fresh = userDetail({ email: 'fresh@example.no' });
    const conflict = new HttpErrorResponse({
      status: 409,
      error: { code: 'NOTHING_TO_CHANGE' },
    });
    const result = await firstValueFrom(
      throwError(() => conflict).pipe(nothingToChangeAsReread(() => of(fresh))),
    );
    expect(result).toEqual({ user: fresh, nothingChanged: true });

    const ok = await firstValueFrom(of(fresh).pipe(nothingToChangeAsReread(() => of(fresh))));
    expect(ok.nothingChanged).toBe(false);

    const other = new HttpErrorResponse({ status: 409, error: { code: 'SOMETHING_ELSE' } });
    await expect(
      firstValueFrom(throwError(() => other).pipe(nothingToChangeAsReread(() => of(fresh)))),
    ).rejects.toBe(other);
  });
});
