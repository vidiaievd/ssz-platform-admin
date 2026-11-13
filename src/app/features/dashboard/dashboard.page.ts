import { DecimalPipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { ButtonDirective } from 'primeng/button';
import { Skeleton } from 'primeng/skeleton';
import { Tag } from 'primeng/tag';
import { AdminStatsPeopleDto } from '../../api/organization/models/admin-stats-people-dto';
import { LanguageService } from '../../core/i18n/language.service';
import { LocalDatePipe } from '../../shared/local-date.pipe';
import { DEFAULT_PERIOD, PERIODS, Period, attentionItems } from './dashboard-model';
import { DashboardData } from './dashboard.data';
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
            icon="pi pi-refresh"
            data-testid="refresh"
            [attr.aria-label]="'dashboard.refresh' | transloco"
            (click)="data.refresh()"
          ></button>
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
            @if (items().length === 0) {
              <p class="text-sm" data-testid="queue-empty">
                <i class="pi pi-check-circle text-green-600" aria-hidden="true"></i>
                {{ 'dashboard.queue.empty' | transloco }}
              </p>
            } @else {
              <ul class="flex flex-col" data-testid="queue-list">
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
      <section class="grid gap-3 md:grid-cols-3" data-testid="kpis">
        @switch (data.stats().kind) {
          @case ('loading') {
            @for (n of [1, 2, 3]; track n) {
              <p-skeleton height="8rem" />
            }
          }
          @case ('error') {
            <p class="text-sm md:col-span-3" role="alert" data-testid="kpi-failed">
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
    </div>
  `,
})
export class DashboardPage {
  protected readonly data = inject(DashboardData);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly lang = inject(LanguageService).current;

  protected readonly periods = PERIODS;
  protected readonly statuses = ['active', 'inactive', 'deleted'] as const;

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

  protected readonly items = computed(() => {
    const q = this.data.queue();
    return q.kind === 'ready' ? attentionItems(q.value.endingSoon) : [];
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
