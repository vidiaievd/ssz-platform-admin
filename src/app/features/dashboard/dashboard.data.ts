import { Injectable, computed, inject, signal } from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { map } from 'rxjs';
import { adminStatsGet } from '../../api/organization/functions';
import { AdminStatsDto } from '../../api/organization/models/admin-stats-dto';
import { OrganizationApi } from '../../api/organization/organization-api';
import { adminSubscriptionStats } from '../../api/subscription/functions';
import { AdminStatsResponseDto } from '../../api/subscription/models/admin-stats-response-dto';
import { SubscriptionApi } from '../../api/subscription/subscription-api';
import { ColumnState } from '../schools/schools-list.data';
import { stateOf } from '../schools/card/plan/school-plan.data';
import { ATTENTION_DAYS, parsePeriod, periodRange } from './dashboard-model';

/**
 * Data of the dashboard. Each widget has its own read and fails alone (§5, rule 5): the KPIs
 * follow the period (organization `admin/stats`), the attention queue does not (subscription
 * `admin/subscriptions/stats`). No auto-refresh: "refresh" reads both again.
 */
@Injectable()
export class DashboardData {
  private readonly organization = inject(OrganizationApi);
  private readonly subscription = inject(SubscriptionApi);

  readonly period = toSignal(
    inject(ActivatedRoute).queryParamMap.pipe(map((p) => parsePeriod(p.get('period')))),
    { requireSync: true },
  );

  /** Bumped by "refresh"; also moves the day window if the page stays open past midnight. */
  private readonly generation = signal(0);
  readonly loadedAt = signal(new Date());

  private readonly statsResource = rxResource({
    params: () => ({ ...periodRange(this.period()), generation: this.generation() }),
    stream: ({ params: { from, to } }) => this.organization.invoke(adminStatsGet, { from, to }),
  });

  private readonly queueResource = rxResource({
    params: () => this.generation(),
    stream: () => this.subscription.invoke(adminSubscriptionStats, { withinDays: ATTENTION_DAYS }),
  });

  readonly stats = computed<ColumnState<AdminStatsDto>>(() => stateOf(this.statsResource));
  readonly queue = computed<ColumnState<AdminStatsResponseDto>>(() => stateOf(this.queueResource));

  refresh(): void {
    this.generation.update((n) => n + 1);
    this.loadedAt.set(new Date());
  }

  reloadStats(): void {
    this.statsResource.reload();
  }

  reloadQueue(): void {
    this.queueResource.reload();
  }
}
