import { AdminLevel } from '../../../../core/auth/admin-level';
import { SchoolStatus } from '../../schools-query';

export type LifecycleTransition = 'suspend' | 'reactivate' | 'close' | 'restore' | 'purge';

export interface TransitionRule {
  readonly transition: LifecycleTransition;
  readonly from: readonly SchoolStatus[];
  /** The lowest level that may make the move. */
  readonly level: AdminLevel;
  /** Irreversible or at once: the admin types the school's name to confirm. */
  readonly confirmName: boolean;
}

/**
 * A copy of organization's `SCHOOL_TRANSITION_RULES` (`school-lifecycle.ts`); the server stays the
 * source of truth and answers 409 `SCHOOL_TRANSITION_NOT_ALLOWED` for a move the school's status
 * no longer allows. The panel only decides which buttons to draw.
 */
export const TRANSITION_RULES: readonly TransitionRule[] = [
  { transition: 'suspend', from: ['active'], level: 'admin', confirmName: false },
  { transition: 'reactivate', from: ['suspended'], level: 'admin', confirmName: false },
  { transition: 'close', from: ['active', 'suspended'], level: 'super', confirmName: true },
  { transition: 'restore', from: ['closed'], level: 'super', confirmName: false },
  { transition: 'purge', from: ['closed'], level: 'super', confirmName: true },
];

/** The moves a school in `status` has at all, whoever asks (the tab explains the ones above the viewer). */
export function transitionsFrom(status: SchoolStatus): readonly TransitionRule[] {
  return TRANSITION_RULES.filter((r) => r.from.includes(status));
}
