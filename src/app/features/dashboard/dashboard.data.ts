import {
  DOCUMENT,
  DestroyRef,
  Injectable,
  InjectionToken,
  computed,
  inject,
  signal,
} from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { AiApi } from '../../api/ai/ai-api';
import {
  adminBreakersList,
  adminRegistryListProviders,
  adminSpendGet,
} from '../../api/ai/functions';
import { BreakerBoardDto } from '../../api/ai/models/breaker-board-dto';
import { PlatformSpendResponseDto } from '../../api/ai/models/platform-spend-response-dto';
import { ProviderResponseDto } from '../../api/ai/models/provider-response-dto';
import { AnalyticsApi } from '../../api/analytics/analytics-api';
import { adminAuditList, adminUsage } from '../../api/analytics/functions';
import { AdminAuditPageDto } from '../../api/analytics/models/admin-audit-page-dto';
import { AdminUsageDto } from '../../api/analytics/models/admin-usage-dto';
import { adminSchoolsList, adminStatsGet } from '../../api/organization/functions';
import { AdminStatsDto } from '../../api/organization/models/admin-stats-dto';
import { OrganizationApi } from '../../api/organization/organization-api';
import { adminSubscriptionStats } from '../../api/subscription/functions';
import { AdminStatsResponseDto } from '../../api/subscription/models/admin-stats-response-dto';
import { SubscriptionApi } from '../../api/subscription/subscription-api';
import { AdminUsersApi } from '../../core/auth/admin-users.api';
import { ColumnState } from '../schools/schools-list.data';
import { stateOf } from '../schools/card/plan/school-plan.data';
import { schoolTabLink } from '../schools/card/school-tabs';
import { PayerNames, payerIds, payerRows } from '../ai/spend/payer-spend-model';
import { TOP_SCHOOLS, aiKpi, agentChart, previousRange } from './dashboard-ai-model';
import { ATTENTION_DAYS, parsePeriod, periodRange } from './dashboard-model';
import { providerAttention, providerChips } from './dashboard-providers-model';

/** How often the providers strip reads ai-service again while the tab is visible. */
export const PROVIDERS_POLL_MS = new InjectionToken<number>('PROVIDERS_POLL_MS', {
  providedIn: 'root',
  factory: () => 60_000,
});

/** Entries of "Recent actions"; the full journal is `/audit`. */
export const RECENT_ACTIONS = 10;

/**
 * Data of the dashboard. Each widget has its own read and fails alone (§5, rule 5): the KPIs
 * follow the period (organization `admin/stats`), the attention queue does not (subscription
 * `admin/subscriptions/stats`). The AI blocks follow the period too: credits by week and the
 * previous period's total (analytics `admin/ai/usage`), providers' money (ai-service
 * `admin/ai/spend`) and the top schools (`groupBy=payer`, names from organization). The
 * providers strip (ai-service providers + breaker board) is the only polled read: once a
 * minute, and only while the tab is visible — a hidden tab reads on its return. The recent
 * admin actions (analytics `admin/audit`) do not follow the period. The count of pending deletion
 * requests (auth `admin/users?status=deletion_pending&limit=1`) is a row of the queue read on its
 * own (phase 6, step 8). "Refresh" reads everything.
 */
@Injectable()
export class DashboardData {
  private readonly organization = inject(OrganizationApi);
  private readonly subscription = inject(SubscriptionApi);
  private readonly analytics = inject(AnalyticsApi);
  private readonly ai = inject(AiApi);
  private readonly users = inject(AdminUsersApi);

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

  /** Pending deletion requests: only the total is used, so one row is asked. */
  private readonly deletionsResource = rxResource({
    params: () => this.generation(),
    stream: () =>
      this.users.list({ status: 'deletion_pending', limit: 1 }).pipe(map((page) => page.total)),
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
  /** Accounts waiting to be erased (auth); a row of the queue that fails on its own. */
  readonly deletions = computed<ColumnState<number>>(() => stateOf(this.deletionsResource));

  private readonly providersResource = rxResource({
    params: () => this.generation(),
    stream: () => this.ai.invoke(adminRegistryListProviders),
  });
  private readonly breakersResource = rxResource({
    params: () => this.generation(),
    stream: () => this.ai.invoke(adminBreakersList),
  });
  private readonly auditResource = rxResource({
    params: () => this.generation(),
    stream: () => this.analytics.invoke(adminAuditList, { limit: RECENT_ACTIONS }),
  });

  readonly providers = computed<ColumnState<ProviderResponseDto[]>>(() =>
    stateOf(this.providersResource),
  );
  readonly board = computed<ColumnState<BreakerBoardDto>>(() => stateOf(this.breakersResource));
  readonly audit = computed<ColumnState<AdminAuditPageDto>>(() => stateOf(this.auditResource));

  /** The strip: a chip per provider; breaker counts and "used" wait for the board. */
  readonly providerChips = computed(() => {
    const p = this.providers();
    if (p.kind !== 'ready') return [];
    const b = this.board();
    return providerChips(p.value, b.kind === 'ready' ? b.value.items : null);
  });
  /** Red and yellow queue rows; none until both reads are in. */
  readonly providerAttention = computed(() => {
    const p = this.providers();
    const b = this.board();
    return p.kind === 'ready' && b.kind === 'ready'
      ? providerAttention(p.value, b.value.items)
      : [];
  });

  constructor() {
    const doc = inject(DOCUMENT);
    // A tick while the tab is hidden only marks the read as due; the return of the tab reads.
    let due = false;
    const poll = () => {
      due = false;
      this.providersResource.reload();
      this.breakersResource.reload();
    };
    const timer = setInterval(() => {
      if (doc.visibilityState === 'visible') poll();
      else due = true;
    }, inject(PROVIDERS_POLL_MS));
    const onVisibility = () => {
      if (doc.visibilityState === 'visible' && due) poll();
    };
    doc.addEventListener('visibilitychange', onVisibility);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(timer);
      doc.removeEventListener('visibilitychange', onVisibility);
    });
  }

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

  reloadDeletions(): void {
    this.deletionsResource.reload();
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

  reloadProviders(): void {
    if (this.providers().kind === 'error') this.providersResource.reload();
    if (this.board().kind === 'error') this.breakersResource.reload();
  }

  reloadAudit(): void {
    this.auditResource.reload();
  }
}
