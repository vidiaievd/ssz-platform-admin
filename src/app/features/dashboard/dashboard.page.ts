import { DecimalPipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { ButtonDirective } from 'primeng/button';
import { Skeleton } from 'primeng/skeleton';
import { Tag } from 'primeng/tag';
import { AdminLifecycleAttentionItemDto } from '../../api/organization/models/admin-lifecycle-attention-item-dto';
import { AdminStatsPeopleDto } from '../../api/organization/models/admin-stats-people-dto';
import { LanguageService } from '../../core/i18n/language.service';
import { LocalDatePipe } from '../../shared/local-date.pipe';
import { schoolTabLink } from '../schools/card/school-tabs';
import { PURGE_URGENT_DAYS, daysUntil } from '../schools/school-lifecycle';
import { seatLevel } from '../schools/seats';
import { DEFAULT_PERIOD, PERIODS, Period, attentionItems } from './dashboard-model';
import { DashboardData } from './dashboard.data';
import { GrowthChart } from './growth-chart';
import { growthBuckets, growthStep, planBars } from './growth-model';
import { Sparkline } from './sparkline';

/**
 * `/` — the simple dashboard (plan 90, phase 3, step 12): the platform's key numbers for the
 * chosen period and the queue of what ends within a week. Read only: an action is taken in the
 * school's card, with a reason. Every widget loads and fails on its own.
 */
@Component({
  selector: 'app-dashboard-page',
  providers: [DashboardData],
  imports: [
    DecimalPipe,
    RouterLink,
    TranslocoPipe,
    ButtonDirective,
    Skeleton,
    Tag,
    LocalDatePipe,
    Sparkline,
    GrowthChart,
  ],
  template: `
    <div class="flex flex-col gap-4">
      <header class="flex flex-wrap items-center gap-3">
        <h1 class="text-2xl font-semibold" data-testid="page-title">
          {{ 'nav.dashboard' | transloco }}
        </h1>
        <div
          class="ml-auto flex flex-wrap items-center gap-3"
          role="group"
          [attr.aria-label]="'dashboard.period' | transloco"
        >
          @for (p of periods; track p) {
            <button
              type="button"
              pButton
              size="small"
              [severity]="p === data.period() ? 'primary' : 'secondary'"
              [outlined]="p !== data.period()"
              [attr.aria-pressed]="p === data.period()"
              [attr.data-testid]="'period-' + p"
              (click)="setPeriod(p)"
            >
              {{ 'dashboard.periods.' + p | transloco }}
            </button>
          }
          <button
            type="button"
            pButton
            size="small"
            severity="secondary"
            data-testid="refresh"
            [attr.aria-label]="'dashboard.refresh' | transloco"
            (click)="data.refresh()"
          >
            <i class="pi pi-refresh" aria-hidden="true"></i>
          </button>
          <span class="text-muted-color text-xs" data-testid="loaded-at">
            {{ 'dashboard.loadedAt' | transloco: { time: time() } }}
          </span>
        </div>
      </header>

      <!-- Attention queue -->
      <section class="border-border flex flex-col gap-2 rounded-md border p-4" data-testid="queue">
        <h2 class="text-base font-semibold">{{ 'dashboard.queue.title' | transloco }}</h2>
        @switch (data.queue().kind) {
          @case ('loading') {
            <p-skeleton height="4rem" />
          }
          @case ('error') {
            <p class="text-sm" role="alert" data-testid="queue-failed">
              {{ 'dashboard.queue.failed' | transloco }} ·
              <button type="button" class="text-primary underline" (click)="data.reloadQueue()">
                {{ 'schools.retry' | transloco }}
              </button>
            </p>
          }
          @default {
            @if (
              items().length === 0 && seatItems().length === 0 && lifecycleItems().length === 0
            ) {
              <p class="text-sm" data-testid="queue-empty">
                <i class="pi pi-check-circle text-green-600" aria-hidden="true"></i>
                {{ 'dashboard.queue.empty' | transloco }}
              </p>
            } @else {
              <ul class="flex flex-col" data-testid="queue-list">
                @for (seat of seatItems(); track seat.schoolId) {
                  <li
                    class="border-border flex flex-wrap items-center gap-x-3 gap-y-1 border-t py-2 text-sm first:border-t-0"
                    data-testid="queue-seat"
                    [attr.data-level]="seat.level"
                  >
                    <p-tag
                      [severity]="seat.level === 'full' ? 'danger' : 'warn'"
                      [value]="'dashboard.queue.kinds.seats_' + seat.level | transloco"
                    />
                    <span>{{ seat.name }}</span>
                    <span class="text-muted-color font-mono text-xs">{{ seat.slug }}</span>
                    <span class="text-xs tabular-nums" data-testid="queue-seat-count">
                      {{ seat.used }} / {{ seat.limit }}
                    </span>
                    <a
                      [routerLink]="seat.link"
                      class="text-primary ml-auto underline"
                      data-testid="queue-seat-link"
                    >
                      {{ 'dashboard.queue.open' | transloco }}
                    </a>
                  </li>
                }
                @for (row of lifecycleItems(); track row.id) {
                  <li
                    class="border-border flex flex-wrap items-center gap-x-3 gap-y-1 border-t py-2 text-sm first:border-t-0"
                    data-testid="queue-lifecycle"
                    [attr.data-kind]="row.kind"
                    [attr.data-urgent]="row.urgent"
                  >
                    <p-tag
                      [severity]="row.kind === 'closing' ? 'warn' : row.urgent ? 'danger' : 'info'"
                      [value]="'dashboard.queue.kinds.' + row.kind | transloco"
                    />
                    <span>{{ row.name }}</span>
                    <span class="text-muted-color font-mono text-xs">{{ row.slug }}</span>
                    <span class="text-xs tabular-nums" data-testid="queue-lifecycle-days">
                      {{
                        (row.kind === 'closing'
                          ? 'dashboard.queue.closesIn'
                          : 'dashboard.queue.purgesIn'
                        ) | transloco: { n: row.days }
                      }}
                    </span>
                    <a
                      [routerLink]="row.link"
                      class="text-primary ml-auto underline"
                      data-testid="queue-lifecycle-link"
                    >
                      {{ 'dashboard.queue.openSchool' | transloco }}
                    </a>
                  </li>
                }
                @for (item of items(); track item.id) {
                  <li
                    class="border-border flex flex-wrap items-center gap-x-3 gap-y-1 border-t py-2 text-sm first:border-t-0"
                    data-testid="queue-item"
                  >
                    <p-tag
                      [severity]="item.kind === 'grantOffEnds' ? 'secondary' : 'warn'"
                      [value]="'dashboard.queue.kinds.' + item.kind | transloco"
                    />
                    <span>{{ item.subject }}</span>
                    <span class="text-muted-color font-mono text-xs" data-testid="queue-payer">
                      {{ item.payerType === 'user' ? '👤 ' : '' }}{{ item.payerId }}
                    </span>
                    <span class="text-muted-color ml-auto text-xs tabular-nums">
                      {{
                        'dashboard.queue.until' | transloco: { date: (item.at | localDate: lang()) }
                      }}
                    </span>
                    @if (item.link; as link) {
                      <a
                        [routerLink]="link"
                        class="text-primary underline"
                        data-testid="queue-link"
                      >
                        {{ 'dashboard.queue.open' | transloco }}
                      </a>
                    }
                  </li>
                }
              </ul>
              @if (truncated()) {
                <p class="text-muted-color text-xs" data-testid="queue-truncated">
                  {{ 'dashboard.queue.truncated' | transloco }}
                </p>
              }
            }
          }
        }
      </section>

      <!-- KPI -->
      <section class="grid gap-3 md:grid-cols-2 xl:grid-cols-4" data-testid="kpis">
        @switch (data.stats().kind) {
          @case ('loading') {
            @for (n of [1, 2, 3, 4]; track n) {
              <p-skeleton height="8rem" />
            }
          }
          @case ('error') {
            <p class="text-sm md:col-span-2 xl:col-span-4" role="alert" data-testid="kpi-failed">
              {{ 'dashboard.kpi.failed' | transloco }} ·
              <button type="button" class="text-primary underline" (click)="data.reloadStats()">
                {{ 'schools.retry' | transloco }}
              </button>
            </p>
          }
          @default {
            @if (stats(); as s) {
              <article
                class="border-border flex flex-col gap-1 rounded-md border p-4"
                data-testid="kpi-schools"
              >
                <h2 class="text-muted-color text-sm">{{ 'dashboard.kpi.schools' | transloco }}</h2>
                <a
                  routerLink="/schools"
                  class="text-3xl font-semibold tabular-nums"
                  data-testid="kpi-value"
                >
                  {{ s.schools.total | number }}
                </a>
                <p class="text-sm tabular-nums" data-testid="kpi-delta">
                  {{ 'dashboard.kpi.delta' | transloco: { n: s.schools.createdInPeriod } }}
                </p>
                <p class="flex flex-wrap gap-x-3 text-xs" data-testid="kpi-by-status">
                  @for (st of statuses; track st) {
                    <a
                      routerLink="/schools"
                      [queryParams]="{ status: st }"
                      class="text-muted-color underline"
                      [attr.data-testid]="'kpi-status-' + st"
                    >
                      {{ 'dashboard.kpi.status.' + st | transloco }} {{ s.schools.byStatus[st] }}
                    </a>
                  }
                </p>
                <p class="text-muted-color text-xs">
                  {{
                    'dashboard.kpi.byKind'
                      | transloco: { school: s.schools.byKind.SCHOOL, solo: s.schools.byKind.SOLO }
                  }}
                </p>
                <app-sparkline [values]="series().schools" />
              </article>

              <article
                class="border-border flex flex-col gap-1 rounded-md border p-4"
                data-testid="kpi-seats"
              >
                <h2 class="text-muted-color text-sm">{{ 'dashboard.kpi.seats' | transloco }}</h2>
                @if (s.seats.schoolsLimited === 0) {
                  <span class="text-3xl font-semibold" data-testid="kpi-value">—</span>
                  <p class="text-muted-color text-sm">
                    {{ 'dashboard.kpi.seatsNone' | transloco }}
                  </p>
                } @else {
                  <span class="text-3xl font-semibold tabular-nums" data-testid="kpi-value">
                    {{ s.seats.used | number }} / {{ s.seats.limit | number }}
                  </span>
                  <p class="text-sm tabular-nums" data-testid="kpi-seats-share">
                    {{ 'dashboard.kpi.seatsShare' | transloco: { n: seatShare() } }}
                  </p>
                  <p class="text-muted-color text-xs">
                    {{ 'dashboard.kpi.seatsSchools' | transloco: { n: s.seats.schoolsLimited } }}
                  </p>
                  <p class="flex flex-wrap gap-x-3 text-xs" data-testid="kpi-seats-flags">
                    <a
                      routerLink="/schools"
                      [queryParams]="{ seats: 'near' }"
                      class="text-muted-color underline"
                      data-testid="kpi-seats-near"
                    >
                      {{ 'dashboard.kpi.seatsNear' | transloco: { n: s.seats.near.total } }}
                    </a>
                    <a
                      routerLink="/schools"
                      [queryParams]="{ seats: 'over' }"
                      class="text-muted-color underline"
                      data-testid="kpi-seats-over"
                    >
                      {{ 'dashboard.kpi.seatsOver' | transloco: { n: s.seats.over.total } }}
                    </a>
                  </p>
                }
              </article>

              @for (card of people(); track card.id) {
                <article
                  class="border-border flex flex-col gap-1 rounded-md border p-4"
                  [attr.data-testid]="'kpi-' + card.id"
                >
                  <h2 class="text-muted-color text-sm">
                    {{ 'dashboard.kpi.' + card.id | transloco }}
                  </h2>
                  <span class="text-3xl font-semibold tabular-nums" data-testid="kpi-value">
                    {{ card.people.total | number }}
                  </span>
                  <p class="text-sm tabular-nums" data-testid="kpi-delta">
                    {{ 'dashboard.kpi.delta' | transloco: { n: card.people.newInPeriod } }}
                  </p>
                  <app-sparkline [values]="card.series" />
                </article>
              }
            }
          }
        }
      </section>

      <div class="grid gap-3 lg:grid-cols-2">
        <!-- Growth: the same organization read as the KPIs, its own skeleton and retry -->
        <section
          class="border-border flex flex-col gap-3 rounded-md border p-4"
          data-testid="growth"
        >
          <h2 class="text-base font-semibold">{{ 'dashboard.growth.title' | transloco }}</h2>
          @switch (data.stats().kind) {
            @case ('loading') {
              <p-skeleton height="8rem" />
              <p-skeleton height="8rem" />
            }
            @case ('error') {
              <p class="text-sm" role="alert" data-testid="growth-failed">
                {{ 'dashboard.growth.failed' | transloco }} ·
                <button type="button" class="text-primary underline" (click)="data.reloadStats()">
                  {{ 'schools.retry' | transloco }}
                </button>
              </p>
            }
            @default {
              @for (g of growth(); track g.metric) {
                <div class="flex flex-col gap-1" [attr.data-testid]="'growth-' + g.metric">
                  <h3 class="flex items-baseline gap-2 text-sm">
                    <span class="text-muted-color">
                      {{ 'dashboard.growth.' + g.metric | transloco }}
                    </span>
                    <span class="font-semibold tabular-nums" data-testid="growth-total">
                      {{ 'dashboard.kpi.delta' | transloco: { n: g.total } }}
                    </span>
                  </h3>
                  @if (g.total === 0) {
                    <p class="text-muted-color text-xs" data-testid="growth-empty">
                      {{ 'dashboard.growth.none' | transloco }}
                    </p>
                  } @else {
                    <app-growth-chart
                      [buckets]="buckets()"
                      [metric]="g.metric"
                      [step]="step()"
                      [label]="
                        ('dashboard.growth.' + g.metric | transloco) +
                        ': ' +
                        ('dashboard.kpi.delta' | transloco: { n: g.total })
                      "
                    />
                  }
                </div>
              }
              <p class="text-muted-color text-xs" data-testid="growth-step">
                {{ 'dashboard.growth.step.' + step() | transloco }}
              </p>
            }
          }
        </section>

        <!-- Plans: the same subscription read as the queue, its own skeleton and retry -->
        <section
          class="border-border flex flex-col gap-3 rounded-md border p-4"
          data-testid="plans"
        >
          <h2 class="text-base font-semibold">{{ 'dashboard.plans.title' | transloco }}</h2>
          @switch (data.queue().kind) {
            @case ('loading') {
              <p-skeleton height="12rem" />
            }
            @case ('error') {
              <p class="text-sm" role="alert" data-testid="plans-failed">
                {{ 'dashboard.plans.failed' | transloco }} ·
                <button type="button" class="text-primary underline" (click)="data.reloadQueue()">
                  {{ 'schools.retry' | transloco }}
                </button>
              </p>
            }
            @default {
              @if (planGroups().length === 0) {
                <p class="text-muted-color text-sm" data-testid="plans-empty">
                  {{ 'dashboard.plans.none' | transloco }}
                </p>
              } @else {
                @for (group of planGroups(); track group.audience) {
                  <div class="flex flex-col gap-1" [attr.data-testid]="'plans-' + group.audience">
                    <h3 class="text-muted-color text-xs uppercase">
                      {{ 'dashboard.plans.audience.' + group.audience | transloco }}
                    </h3>
                    <ul class="flex flex-col">
                      @for (bar of group.bars; track bar.code) {
                        <li>
                          <a
                            [routerLink]="['/plans', bar.code]"
                            class="hover:bg-emphasis flex flex-col gap-1 rounded px-2 py-1.5"
                            [class.opacity-60]="bar.archived"
                            data-testid="plan-bar"
                            [attr.data-code]="bar.code"
                            [attr.data-archived]="bar.archived"
                          >
                            <span class="flex flex-wrap items-center gap-x-2 text-sm">
                              <span class="font-medium">{{ bar.name }}</span>
                              <span class="text-muted-color font-mono text-xs">
                                {{ bar.code }} · v{{ bar.currentVersion }}
                              </span>
                              @if (bar.archived) {
                                <p-tag
                                  severity="secondary"
                                  [value]="'dashboard.plans.archived' | transloco"
                                />
                              }
                              <span class="ml-auto tabular-nums" data-testid="plan-bar-count">
                                {{ bar.subscribers | number }}
                              </span>
                            </span>
                            <span
                              class="bg-surface-100 dark:bg-surface-800 flex h-2 w-full overflow-hidden rounded-sm"
                              aria-hidden="true"
                            >
                              <span
                                class="bg-primary h-full"
                                [class.bg-surface-400]="bar.archived"
                                [style.width.%]="bar.currentPct"
                              ></span>
                              <span
                                class="bg-primary/40 h-full"
                                [style.width.%]="bar.olderPct"
                              ></span>
                            </span>
                            @if (bar.onOlder > 0 || bar.trial > 0) {
                              <span
                                class="text-muted-color flex flex-wrap gap-x-3 text-xs tabular-nums"
                              >
                                @if (bar.onOlder > 0) {
                                  <span data-testid="plan-bar-older">
                                    {{ 'dashboard.plans.older' | transloco: { n: bar.onOlder } }}
                                  </span>
                                }
                                @if (bar.trial > 0) {
                                  <span data-testid="plan-bar-trial">
                                    {{ 'dashboard.plans.trial' | transloco: { n: bar.trial } }}
                                  </span>
                                }
                              </span>
                            }
                          </a>
                        </li>
                      }
                    </ul>
                  </div>
                }
                <p class="text-muted-color flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                  <span class="flex items-center gap-1">
                    <span class="bg-primary inline-block h-2 w-3 rounded-sm"></span>
                    {{ 'dashboard.plans.legendCurrent' | transloco }}
                  </span>
                  <span class="flex items-center gap-1">
                    <span class="bg-primary/40 inline-block h-2 w-3 rounded-sm"></span>
                    {{ 'dashboard.plans.legendOlder' | transloco }}
                  </span>
                  <span>{{ 'dashboard.plans.freeNote' | transloco }}</span>
                </p>
              }
            }
          }
        </section>
      </div>
    </div>
  `,
})
export class DashboardPage {
  protected readonly data = inject(DashboardData);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly lang = inject(LanguageService).current;

  protected readonly periods = PERIODS;
  protected readonly statuses = ['active', 'suspended', 'closed'] as const;

  protected readonly stats = computed(() => {
    const s = this.data.stats();
    return s.kind === 'ready' ? s.value : null;
  });

  /** The daily counts per kind of thing, oldest day first. */
  protected readonly series = computed(() => {
    const daily = this.stats()?.daily ?? [];
    return {
      schools: daily.map((d) => d.schools),
      students: daily.map((d) => d.students),
      teachers: daily.map((d) => d.teachers),
    };
  });

  protected readonly people = computed<
    { id: 'students' | 'teachers'; people: AdminStatsPeopleDto; series: number[] }[]
  >(() => {
    const s = this.stats();
    if (!s) return [];
    return [
      { id: 'students', people: s.students, series: this.series().students },
      { id: 'teachers', people: s.teachers, series: this.series().teachers },
    ];
  });

  /** Bars of the growth block: grouped by day, 7 days or month, depending on the period. */
  protected readonly step = computed(() => growthStep(this.stats()?.daily.length ?? 0));
  protected readonly buckets = computed(() =>
    growthBuckets(this.stats()?.daily ?? [], this.step()),
  );
  protected readonly growth = computed<{ metric: 'schools' | 'students'; total: number }[]>(() => {
    const s = this.stats();
    if (!s) return [];
    return [
      { metric: 'schools', total: s.schools.createdInPeriod },
      { metric: 'students', total: s.students.newInPeriod },
    ];
  });

  /** Plans of the subscription stats as bars, workspace plans first (the server's order). */
  protected readonly planGroups = computed(() => {
    const q = this.data.queue();
    if (q.kind !== 'ready') return [];
    const bars = planBars(q.value.plans);
    return (['workspace', 'individual'] as const)
      .map((audience) => ({ audience, bars: bars.filter((b) => b.audience === audience) }))
      .filter((g) => g.bars.length > 0);
  });

  protected readonly items = computed(() => {
    const q = this.data.queue();
    return q.kind === 'ready' ? attentionItems(q.value.endingSoon) : [];
  });
  /** Schools over their limit: at the ceiling (red) first, then in the grace (yellow). */
  protected readonly seatItems = computed(() => {
    const over = this.stats()?.seats.over;
    if (!over) return [];
    return over.items
      .map((i) => ({
        ...i,
        level: seatLevel(i.used, i.limit),
        link: schoolTabLink(i.schoolId, 'plan'),
      }))
      .filter((i) => i.level === 'full' || i.level === 'warning')
      .sort((a, b) => (a.level === b.level ? 0 : a.level === 'full' ? -1 : 1));
  });
  /** Suspended schools about to close and closed ones about to be purged (organization stats). */
  protected readonly lifecycleItems = computed(() => {
    const lc = this.stats()?.lifecycle;
    if (!lc) return [];
    const row = (kind: 'closing' | 'purging', i: AdminLifecycleAttentionItemDto) => {
      const days = daysUntil(i.at);
      return {
        id: `${kind}:${i.schoolId}`,
        kind,
        name: i.name,
        slug: i.slug,
        days,
        urgent: kind === 'purging' && days <= PURGE_URGENT_DAYS,
        at: i.at,
        link: schoolTabLink(i.schoolId, 'danger'),
      };
    };
    return [
      ...lc.closingSoon.items.map((i) => row('closing', i)),
      ...lc.purgingSoon.items.map((i) => row('purging', i)),
    ].sort((a, b) => a.at.localeCompare(b.at));
  });
  protected readonly seatShare = computed(() => {
    const seats = this.stats()?.seats;
    return seats && seats.limit > 0 ? Math.round((seats.used / seats.limit) * 100) : 0;
  });
  protected readonly truncated = computed(() => {
    const q = this.data.queue();
    return q.kind === 'ready' && q.value.endingSoon.truncated;
  });

  protected time(): string {
    return this.data
      .loadedAt()
      .toLocaleTimeString(this.lang(), { hour: '2-digit', minute: '2-digit' });
  }

  protected setPeriod(period: Period): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { period: period === DEFAULT_PERIOD ? null : period },
      queryParamsHandling: 'merge',
    });
  }
}
