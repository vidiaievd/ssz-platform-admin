import { Injectable, computed, inject, signal } from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { AiApi } from '../../api/ai/ai-api';
import { adminSpendGet } from '../../api/ai/functions';
import { PlatformSpendResponseDto } from '../../api/ai/models/platform-spend-response-dto';
import { AnalyticsApi } from '../../api/analytics/analytics-api';
import { adminUsage } from '../../api/analytics/functions';
import { AdminUsageDto } from '../../api/analytics/models/admin-usage-dto';
import { adminSchoolsList, adminStatsGet } from '../../api/organization/functions';
import { AdminStatsDto } from '../../api/organization/models/admin-stats-dto';
import { OrganizationApi } from '../../api/organization/organization-api';
import { adminSubscriptionStats } from '../../api/subscription/functions';
import { AdminStatsResponseDto } from '../../api/subscription/models/admin-stats-response-dto';
import { SubscriptionApi } from '../../api/subscription/subscription-api';
import { ColumnState } from '../schools/schools-list.data';
import { stateOf } from '../schools/card/plan/school-plan.data';
import { schoolTabLink } from '../schools/card/school-tabs';
import { PayerNames, payerIds, payerRows } from '../ai/spend/payer-spend-model';
import { TOP_SCHOOLS, aiKpi, agentChart, previousRange } from './dashboard-ai-model';
import { ATTENTION_DAYS, parsePeriod, periodRange } from './dashboard-model';

/**
 * Data of the dashboard. Each widget has its own read and fails alone (§5, rule 5): the KPIs
 * follow the period (organization `admin/stats`), the attention queue does not (subscription
 * `admin/subscriptions/stats`). The AI blocks follow the period too: credits by week and the
 * previous period's total (analytics `admin/ai/usage`), providers' money (ai-service
 * `admin/ai/spend`) and the top schools (`groupBy=payer`, names from organization). No
 * auto-refresh: "refresh" reads everything again.
 */
@Injectable()
export class DashboardData {
  private readonly organization = inject(OrganizationApi);
  private readonly subscription = inject(SubscriptionApi);
  private readonly analytics = inject(AnalyticsApi);
  private readonly ai = inject(AiApi);

  readonly period = toSignal(
    inject(ActivatedRoute).queryParamMap.pipe(map((p) => parsePeriod(p.get('period')))),
    { requireSync: true },
  );

  /** Bumped by "refresh"; also moves the day window if the page stays open past midnight. */
  private readonly generation = signal(0);
  readonly loadedAt = signal(new Date());

  /** The period's days; every period-bound read takes it, so "refresh" re-reads them all. */
  private readonly range = computed(() => ({
    ...periodRange(this.period()),
    generation: this.generation(),
  }));

  private readonly statsResource = rxResource({
    params: () => this.range(),
    stream: ({ params: { from, to } }) => this.organization.invoke(adminStatsGet, { from, to }),
  });

  private readonly queueResource = rxResource({
    params: () => this.generation(),
    stream: () => this.subscription.invoke(adminSubscriptionStats, { withinDays: ATTENTION_DAYS }),
  });

  private readonly aiWeeksResource = rxResource({
    params: () => this.range(),
    stream: ({ params: { from, to } }) =>
      this.analytics.invoke(adminUsage, { from, to, groupBy: 'week' }),
  });

  /** Only the total is used; `capability` is the smallest answer that carries it. */
  private readonly aiPreviousResource = rxResource({
    params: () => ({ ...previousRange(this.period()), generation: this.generation() }),
    stream: ({ params: { from, to } }) =>
      this.analytics.invoke(adminUsage, { from, to, groupBy: 'capability' }),
  });

  private readonly aiSpendResource = rxResource({
    params: () => this.range(),
    stream: ({ params: { from, to } }) => this.ai.invoke(adminSpendGet, { from, to }),
  });

  private readonly aiTopResource = rxResource({
    params: () => this.range(),
    stream: ({ params: { from, to } }) =>
      this.analytics.invoke(adminUsage, {
        from,
        to,
        groupBy: 'payer',
        payerType: 'workspace',
        limit: String(TOP_SCHOOLS),
      }),
  });

  /** Ids of the top, by value: a retry of a failed top with the same schools asks no names again. */
  private readonly topIds = computed(
    () =>
      this.aiTopResource.hasValue() ? payerIds(this.aiTopResource.value()).schools : undefined,
    { equal: (a, b) => a?.join() === b?.join() },
  );

  /** School names; null = the read failed (rows then show ids). */
  private readonly namesResource = rxResource({
    params: () => this.topIds(),
    stream: ({ params: ids }) =>
      ids.length === 0
        ? of<PayerNames>({ schools: new Map(), users: new Map() })
        : this.organization
            .invoke(adminSchoolsList, { ids: ids.join(','), limit: ids.length })
            .pipe(
              map((page): PayerNames => ({
                schools: new Map(
                  page.items.map((s) => [s.id, { name: s.name, slug: s.slug, kind: s.kind }]),
                ),
                users: new Map(),
              })),
              catchError(() => of(null)),
            ),
  });

  readonly stats = computed<ColumnState<AdminStatsDto>>(() => stateOf(this.statsResource));
  readonly aiWeeks = computed<ColumnState<AdminUsageDto>>(() => stateOf(this.aiWeeksResource));
  readonly aiSpend = computed<ColumnState<PlatformSpendResponseDto>>(() =>
    stateOf(this.aiSpendResource),
  );
  readonly aiTop = computed<ColumnState<AdminUsageDto>>(() => stateOf(this.aiTopResource));

  /** The previous period, or null while it loads or when it failed (the KPI then shows no change). */
  private readonly aiPrevious = computed(() => {
    const s = stateOf(this.aiPreviousResource);
    return s.kind === 'ready' ? s.value : null;
  });
  readonly aiPreviousFailed = computed(() => stateOf(this.aiPreviousResource).kind === 'error');

  readonly aiKpi = computed(() => {
    const w = this.aiWeeks();
    return w.kind === 'ready' ? aiKpi(w.value, this.aiPrevious()) : null;
  });
  readonly agentChart = computed(() => {
    const w = this.aiWeeks();
    return w.kind === 'ready' ? agentChart(w.value) : null;
  });

  private readonly names = computed(() =>
    this.namesResource.hasValue() ? (this.namesResource.value() ?? null) : null,
  );
  readonly namesFailed = computed(
    () => this.namesResource.hasValue() && this.namesResource.value() === null,
  );
  /** The top schools; a school found in organization links to its "AI & services" tab. */
  readonly topSchools = computed(() => {
    const t = this.aiTop();
    if (t.kind !== 'ready') return [];
    return payerRows(t.value, this.names()).map((r) => ({
      ...r,
      link: r.name !== null ? schoolTabLink(r.payerId, 'ai') : null,
    }));
  });
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

  /** Credits by week and the previous period: the KPI and the per-agent chart. */
  reloadAiWeeks(): void {
    this.aiWeeksResource.reload();
    if (this.aiPreviousFailed()) this.aiPreviousResource.reload();
  }

  reloadAiSpend(): void {
    this.aiSpendResource.reload();
  }

  reloadAiTop(): void {
    this.aiTopResource.reload();
  }

  reloadNames(): void {
    this.namesResource.reload();
  }
}
