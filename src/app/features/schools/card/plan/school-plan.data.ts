import { Injectable, computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Observable, catchError, of, throwError } from 'rxjs';
import {
  adminAccountsGet,
  adminAccountsHistory,
  adminPlansGet,
  adminPlansList,
} from '../../../../api/subscription/functions';
import { AccountHistoryResponseDto } from '../../../../api/subscription/models/account-history-response-dto';
import { AccountOverviewResponseDto } from '../../../../api/subscription/models/account-overview-response-dto';
import { PlanFeatureResponseDto } from '../../../../api/subscription/models/plan-feature-response-dto';
import { PlanResponseDto } from '../../../../api/subscription/models/plan-response-dto';
import { SubscriptionApi } from '../../../../api/subscription/subscription-api';
import { ApiError } from '../../../../core/auth/api-error';
import { ColumnState } from '../../schools-list.data';
import { SchoolCardData } from '../school-card.data';

/** A school is a `workspace` payer (SOLO included). */
export const PAYER_TYPE = 'workspace' as const;

/** subscription answers 404 for a payer it has never seen: no account yet, the free plan. */
function noAccountAsNull<T>(source: Observable<T>): Observable<T | null> {
  return source.pipe(
    catchError((error: unknown) =>
      ApiError.from(error).status === 404 ? of(null) : throwError(() => error),
    ),
  );
}

function stateOf<T>(resource: {
  error(): unknown;
  hasValue(): boolean;
  value(): T | undefined;
}): ColumnState<T> {
  if (resource.error()) return { kind: 'error' };
  if (!resource.hasValue()) return { kind: 'loading' };
  return { kind: 'ready', value: resource.value() as T };
}

/**
 * Data of the "Plan" tab. The plan that applies is the card's lookup (it already settles
 * "no account / expired → free plan"); the subscription and live grants come from the account,
 * past ones from its history, and the version's keys from the plan itself. Each read fails on
 * its own: a section shows "retry" and the others stay (§5, rule 5).
 */
@Injectable()
export class SchoolPlanData {
  private readonly subscription = inject(SubscriptionApi);
  readonly card = inject(SchoolCardData);

  private readonly accountResource = rxResource({
    params: () => this.card.schoolId(),
    stream: ({ params: externalId }) =>
      this.subscription
        .invoke(adminAccountsGet, { type: PAYER_TYPE, externalId })
        .pipe(noAccountAsNull),
  });

  private readonly historyResource = rxResource({
    params: () => this.card.schoolId(),
    stream: ({ params: externalId }) =>
      this.subscription
        .invoke(adminAccountsHistory, { type: PAYER_TYPE, externalId })
        .pipe(noAccountAsNull),
  });

  /** The catalog: options of "change plan" and the latest version of every plan. */
  private readonly plansResource = rxResource({
    stream: () => this.subscription.invoke(adminPlansList),
  });

  /** The plan that applies now, from the card's lookup. */
  readonly applied = computed(() => {
    const plan = this.card.plan();
    return plan.kind === 'ready' ? plan.value : undefined;
  });

  private readonly planDetailsResource = rxResource({
    params: () => this.applied()?.plan?.code,
    stream: ({ params: code }) => this.subscription.invoke(adminPlansGet, { code }),
  });

  /** `null` = the school has no billing account yet (it is on the free plan all the same). */
  readonly account = computed<ColumnState<AccountOverviewResponseDto | null>>(() =>
    stateOf(this.accountResource),
  );
  readonly history = computed<ColumnState<AccountHistoryResponseDto | null>>(() =>
    stateOf(this.historyResource),
  );
  readonly plans = computed<ColumnState<PlanResponseDto[]>>(() => stateOf(this.plansResource));

  /** Plans a school may be put on: its audience, not archived. */
  readonly assignablePlans = computed(() => {
    const plans = this.plans();
    return plans.kind === 'ready'
      ? plans.value.filter((p) => p.audience === 'workspace' && p.status === 'active')
      : [];
  });

  /** The applied plan's newest version, when it is newer than the one the school is on. */
  readonly newerVersion = computed<number | null>(() => {
    const version = this.applied()?.plan?.version;
    const details = this.planDetailsResource.hasValue() ? this.planDetailsResource.value() : null;
    if (version === undefined || !details) return null;
    return details.current.version > version ? details.current.version : null;
  });

  /** What the applied version gives, key by key. */
  readonly features = computed<ColumnState<PlanFeatureResponseDto[]>>(() => {
    const state = stateOf(this.planDetailsResource);
    if (state.kind !== 'ready') return state;
    const version = this.applied()?.plan?.version;
    const found = state.value.versions.find((v) => v.version === version);
    return { kind: 'ready', value: found?.features ?? [] };
  });

  reloadAccount(): void {
    this.accountResource.reload();
  }

  reloadHistory(): void {
    this.historyResource.reload();
  }

  reloadPlans(): void {
    this.plansResource.reload();
  }

  reloadFeatures(): void {
    this.planDetailsResource.reload();
  }

  /** After any change: the account, its history and the card's header (and so the plan). */
  afterChange(): void {
    this.accountResource.reload();
    this.historyResource.reload();
    this.card.reloadPlan();
  }
}
