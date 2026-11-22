import { Signal, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoService } from '@jsverse/transloco';

/**
 * Codes subscription-service answers on a payer's account changes (change plan, cancel, issue or
 * revoke a grant): `account_changed` is the 409 of the optimistic lock (the account moved past the
 * revision the dialog sent), the rest are 422 refusals (`account-errors.ts`, `plan-errors.ts`).
 * Each has its words under `schools.plan.errors`; the code itself is still shown under them.
 */
export const ACCOUNT_REFUSAL_CODES = [
  'account_changed',
  'grant_already_revoked',
  'grant_ended',
  'no_current_subscription',
  'audience_mismatch',
  'plan_archived',
  'trial_needs_period_end',
  'period_end_in_past',
  'invalid_grant_period',
  'grant_reason_required',
  'grant_disable_with_allowance',
  'grant_disable_not_applicable',
  'feature_not_for_audience',
  'unknown_feature_key',
  'invalid_credits',
  'credits_not_applicable',
  'limit_required',
  'invalid_limit',
  'unknown_limit',
] as const;

/**
 * `codeText` of a ReasonDialog over a payer's account, in the current language (follows a
 * language switch). Call in an injection context.
 */
export function accountRefusalText(): Signal<Readonly<Record<string, string>>> {
  return toSignal(
    inject(TranslocoService).selectTranslateObject<Record<string, string>>('schools.plan.errors'),
    {
      initialValue: {},
    },
  );
}
