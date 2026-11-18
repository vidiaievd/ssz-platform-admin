import { Signal } from '@angular/core';
import { AccountLookupItemDto } from '../../../api/subscription/models/account-lookup-item-dto';
import { ColumnState } from '../schools-list.data';

/** subscription's two payers: a school (SOLO workspaces too) and a self-study learner. */
export type PayerType = 'workspace' | 'user';

/** Student seats as organization counts them; only a school has them. */
export interface PayerSeats {
  readonly used: number;
  readonly limit: number | null;
}

/**
 * The card a payer's tabs live in — the school card or the user card (plan 90, phase 6, step 7).
 * The "Plan", "AI & services" and "Journal" tabs read their payer from here, so one tab serves
 * both cards. The card reads the plan that applies (subscription `accounts/lookup`) once; the tabs
 * share it with the card's header.
 */
export abstract class PayerCard {
  abstract readonly payerType: PayerType;
  /** Set by the card page from the route; `undefined` until then. */
  abstract readonly payerId: Signal<string | undefined>;
  /** The plan that applies now; the lookup settles "no account / expired → free plan". */
  abstract readonly plan: Signal<ColumnState<AccountLookupItemDto | null>>;
  /** A school's seats from organization; `null` before the read and for a user. */
  abstract readonly seats: Signal<PayerSeats | null>;

  /** Reads the plan that applies again (the header's retry, and after a change). */
  abstract reloadPlan(): void;

  /** After a change of plan or grants: whatever else of the card it may move (a school's seats). */
  abstract afterPlanChange(): void;
}

/**
 * The few texts of the shared tabs that name the payer ("this school …"): a learner's card reads
 * them from `users.payer.*`, a school's from `schools.*`. `key` is the path under either root,
 * e.g. `plan.noAccount`.
 */
export function payerText(payerType: PayerType, key: string): string {
  return payerType === 'user' ? `users.payer.${key}` : `schools.${key}`;
}
