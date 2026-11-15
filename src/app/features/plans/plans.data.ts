import { Injectable, computed, inject, linkedSignal, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import {
  adminPlansGet,
  adminPlansList,
  adminSubscriptionStats,
} from '../../api/subscription/functions';
import { PlanDetailsResponseDto } from '../../api/subscription/models/plan-details-response-dto';
import { PlanResponseDto } from '../../api/subscription/models/plan-response-dto';
import { PlanStatsDto } from '../../api/subscription/models/plan-stats-dto';
import { SubscriptionApi } from '../../api/subscription/subscription-api';
import { ApiError } from '../../core/auth/api-error';
import { stateOf } from '../schools/card/plan/school-plan.data';
import { ColumnState } from '../schools/schools-list.data';
import { CatalogGroup, VersionRow, catalogGroups, subscribersOf, versionRows } from './plan-model';

/** Subscribers per plan and version: the `plans[]` of subscription's stats. */
function statsStream(api: SubscriptionApi) {
  return api.invoke(adminSubscriptionStats, {}).pipe(map((res) => res.plans));
}

/**
 * Data of `/plans`: the catalog, and subscribers from the stats — two reads, each failing on its
 * own (§5, rule 5): without the stats the catalog stays and its counts show "—" with a retry.
 */
@Injectable()
export class PlansListData {
  private readonly api = inject(SubscriptionApi);

  private readonly plansResource = rxResource({ stream: () => this.api.invoke(adminPlansList) });
  private readonly statsResource = rxResource({ stream: () => statsStream(this.api) });

  readonly plans = computed<ColumnState<PlanResponseDto[]>>(() => stateOf(this.plansResource));
  readonly stats = computed<ColumnState<PlanStatsDto[]>>(() => stateOf(this.statsResource));

  readonly groups = computed<CatalogGroup[]>(() => {
    const plans = this.plans();
    if (plans.kind !== 'ready') return [];
    const stats = this.stats();
    return catalogGroups(plans.value, stats.kind === 'ready' ? stats.value : null);
  });

  reload(): void {
    this.plansResource.reload();
    this.statsResource.reload();
  }

  reloadStats(): void {
    this.statsResource.reload();
  }
}

/**
 * Data of `/plans/:code`: the plan with every version, and subscribers from the stats. A rename
 * or archive answers with the plan without its versions; it is laid over the read, which keeps
 * them.
 */
@Injectable()
export class PlanCardData {
  private readonly api = inject(SubscriptionApi);

  /** Set by the page from the route; `undefined` until then. */
  readonly code = signal<string | undefined>(undefined);

  private readonly planResource = rxResource({
    params: () => this.code(),
    stream: ({ params: code }) => this.api.invoke(adminPlansGet, { code }),
  });
  private readonly statsResource = rxResource({ stream: () => statsStream(this.api) });

  /** The read, with the answer of the last rename or archive laid over it. */
  private readonly current = linkedSignal<ColumnState<PlanDetailsResponseDto>>(() =>
    stateOf(this.planResource),
  );

  readonly plan = this.current.asReadonly();
  readonly stats = computed<ColumnState<PlanStatsDto[]>>(() => stateOf(this.statsResource));

  /** subscription does not know the code. */
  readonly notFound = computed(() => {
    const error = this.planResource.error();
    return !!error && ApiError.from(error).status === 404;
  });

  readonly details = computed<PlanDetailsResponseDto | null>(() => {
    const plan = this.current();
    return plan.kind === 'ready' ? plan.value : null;
  });

  private readonly statsValue = computed(() => {
    const stats = this.stats();
    return stats.kind === 'ready' ? stats.value : null;
  });

  readonly versions = computed<VersionRow[]>(() => {
    const plan = this.details();
    return plan ? versionRows(plan, this.statsValue()) : [];
  });

  readonly subscribers = computed(() => {
    const plan = this.details();
    return plan ? subscribersOf(this.statsValue(), plan.code) : null;
  });

  /** A rename or archive went through: its name and status replace the read's. */
  changed(plan: PlanResponseDto): void {
    const state = this.current();
    if (state.kind !== 'ready') return;
    this.current.set({
      kind: 'ready',
      value: { ...state.value, name: plan.name, status: plan.status, current: plan.current },
    });
  }

  reload(): void {
    this.planResource.reload();
    this.statsResource.reload();
  }

  reloadStats(): void {
    this.statsResource.reload();
  }
}
