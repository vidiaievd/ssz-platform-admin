import { DecimalPipe, NgTemplateOutlet, PercentPipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { ButtonDirective } from 'primeng/button';
import { Skeleton } from 'primeng/skeleton';
import { Tag } from 'primeng/tag';
import { LanguageService } from '../../../core/i18n/language.service';
import { LocalDatePipe } from '../../../shared/local-date.pipe';
import { AiSpendData } from './ai-spend.data';
import { PayerSpendComponent } from './payer-spend';
import { PayerSpendData } from './payer-spend.data';
import { SpendChartComponent } from './spend-chart';
import { MAIN_CURRENCY, SpendFigures, audioHours, formatMoney } from './spend-model';
import { SPEND_PRESETS, SpendPreset, isValidRange, presetParams } from './spend-period';

/**
 * `/ai/spend` — "AI → Spend" (plan 90, phase 7, step 5): what the platform's AI calls cost per
 * model in a period, from ai-service's call ledger. KPIs, a table per model (unfolds per agent),
 * and the cost per day stacked by model; below it (step 17) the credits charged per payer. Read
 * only. A call without a price is a warning, never a zero: its money is unknown, not nothing.
 */
@Component({
  selector: 'app-ai-spend-page',
  providers: [AiSpendData, PayerSpendData],
  imports: [
    DecimalPipe,
    NgTemplateOutlet,
    PercentPipe,
    TranslocoPipe,
    ButtonDirective,
    Skeleton,
    Tag,
    LocalDatePipe,
    SpendChartComponent,
    PayerSpendComponent,
  ],
  template: `
    <section class="flex flex-col gap-4" data-testid="ai-spend">
      <div class="flex flex-wrap items-center gap-2">
        <h2 class="text-base font-semibold">{{ 'ai.spend.title' | transloco }}</h2>
        <div
          class="ml-auto flex flex-wrap items-center gap-2"
          role="group"
          [attr.aria-label]="'ai.spend.period' | transloco"
        >
          @for (p of presets; track p) {
            <button
              type="button"
              pButton
              size="small"
              [severity]="p === data.preset() ? 'primary' : 'secondary'"
              [outlined]="p !== data.preset()"
              [attr.aria-pressed]="p === data.preset()"
              [attr.data-testid]="'spend-preset-' + p"
              (click)="setPreset(p)"
            >
              {{ 'ai.spend.presets.' + p | transloco }}
            </button>
          }
          <label class="flex items-center gap-1 text-xs">
            <span class="text-muted-color">{{ 'ai.spend.from' | transloco }}</span>
            <input
              type="date"
              class="border-border bg-transparent rounded border px-1 py-0.5 text-sm"
              data-testid="spend-from"
              [value]="data.range().from"
              [max]="data.range().to"
              (change)="setRange($any($event.target).value, data.range().to)"
            />
          </label>
          <label class="flex items-center gap-1 text-xs">
            <span class="text-muted-color">{{ 'ai.spend.to' | transloco }}</span>
            <input
              type="date"
              class="border-border bg-transparent rounded border px-1 py-0.5 text-sm"
              data-testid="spend-to"
              [value]="data.range().to"
              [min]="data.range().from"
              (change)="setRange(data.range().from, $any($event.target).value)"
            />
          </label>
          <button
            type="button"
            pButton
            size="small"
            severity="secondary"
            data-testid="spend-refresh"
            [attr.aria-label]="'ai.spend.refresh' | transloco"
            (click)="reload()"
          >
            <i class="pi pi-refresh" aria-hidden="true"></i>
          </button>
        </div>
      </div>
      <p class="text-muted-color text-sm">
        {{ 'ai.spend.hint' | transloco }}
        <span class="tabular-nums" data-testid="spend-range">
          {{ data.range().from | localDate: lang() }} – {{ data.range().to | localDate: lang() }}
        </span>
      </p>
      @if (rangeRefused()) {
        <p
          class="text-sm text-red-600 dark:text-red-400"
          role="alert"
          data-testid="spend-range-refused"
        >
          {{ 'ai.spend.rangeRefused' | transloco: { max: 366 } }}
        </p>
      }

      @switch (data.spend().kind) {
        @case ('loading') {
          <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            @for (n of [1, 2, 3, 4]; track n) {
              <p-skeleton height="6rem" />
            }
          </div>
          <p-skeleton height="12rem" />
        }
        @case ('error') {
          <p class="text-sm" role="alert" data-testid="spend-failed">
            {{ 'ai.spend.failed' | transloco }} ·
            <button type="button" class="text-primary underline" (click)="data.reload()">
              {{ 'schools.retry' | transloco }}
            </button>
          </p>
        }
        @default {
          @if (data.totals(); as t) {
            <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-4" data-testid="spend-kpis">
              <article
                class="border-border flex flex-col gap-1 rounded-md border p-4"
                data-testid="kpi-cost"
              >
                <h3 class="text-muted-color text-sm">{{ 'ai.spend.kpi.cost' | transloco }}</h3>
                <span class="text-3xl font-semibold tabular-nums" data-testid="kpi-value">
                  {{ money(t.usdMicros) }}
                </span>
                @for (m of t.other; track m.currency) {
                  <span class="text-sm tabular-nums" data-testid="kpi-cost-other">
                    + {{ moneyOf(m.amount, m.currency) }}
                  </span>
                }
                <p class="text-muted-color text-xs">
                  {{ 'ai.spend.kpi.credits' | transloco: { credits: t.credits } }}
                </p>
              </article>

              <article
                class="border-border flex flex-col gap-1 rounded-md border p-4"
                data-testid="kpi-calls"
              >
                <h3 class="text-muted-color text-sm">{{ 'ai.spend.kpi.calls' | transloco }}</h3>
                <span class="text-3xl font-semibold tabular-nums" data-testid="kpi-value">
                  {{ t.calls | number }}
                </span>
                <p class="text-xs tabular-nums" data-testid="kpi-calls-detail">
                  {{
                    'ai.spend.kpi.callsDetail'
                      | transloco: { failed: t.failed, fallback: t.fallbackCalls }
                  }}
                </p>
              </article>

              <article
                class="flex flex-col gap-1 rounded-md border p-4"
                [class]="
                  t.unpricedCalls > 0 ? 'border-amber-300 dark:border-amber-700' : 'border-border'
                "
                data-testid="kpi-unpriced"
                [attr.data-warn]="t.unpricedCalls > 0"
              >
                <h3 class="text-muted-color text-sm">
                  {{ 'ai.spend.kpi.unpriced' | transloco }}
                </h3>
                <span class="flex items-center gap-2 text-3xl font-semibold tabular-nums">
                  @if (t.unpricedCalls > 0) {
                    <i
                      class="pi pi-exclamation-triangle text-xl text-amber-500"
                      aria-hidden="true"
                    ></i>
                  }
                  <span data-testid="kpi-value">{{ t.unpricedCalls | number }}</span>
                </span>
                <p class="text-xs" data-testid="kpi-unpriced-hint">
                  @if (t.unpricedCalls > 0) {
                    {{
                      'ai.spend.kpi.unpricedHint'
                        | transloco: { models: t.unpricedModels.join(', ') }
                    }}
                  } @else {
                    {{ 'ai.spend.kpi.unpricedNone' | transloco }}
                  }
                </p>
              </article>

              <article
                class="border-border flex flex-col gap-1 rounded-md border p-4"
                data-testid="kpi-volume"
              >
                <h3 class="text-muted-color text-sm">{{ 'ai.spend.kpi.volume' | transloco }}</h3>
                <p class="text-sm tabular-nums">
                  {{
                    'ai.spend.kpi.tokens'
                      | transloco
                        : { input: (t.inputTokens | number), output: (t.outputTokens | number) }
                  }}
                </p>
                <p class="text-sm tabular-nums" data-testid="kpi-audio">
                  {{
                    'ai.spend.kpi.audio'
                      | transloco: { hours: (hours(t.audioMs) | number: '1.0-2') }
                  }}
                </p>
                <p class="text-sm tabular-nums" data-testid="kpi-characters">
                  {{ 'ai.spend.kpi.characters' | transloco: { count: (t.characters | number) } }}
                </p>
              </article>
            </div>
          }

          <!-- Per model -->
          @if (data.rows().length === 0) {
            <p class="text-sm" data-testid="spend-empty">{{ 'ai.spend.empty' | transloco }}</p>
          } @else {
            <div class="relative overflow-x-auto">
              <table class="w-full min-w-[60rem] text-sm" data-testid="spend-table">
                <thead class="text-muted-color text-left">
                  <tr>
                    <th class="py-1 pr-4 font-medium">{{ 'ai.spend.col.model' | transloco }}</th>
                    <th class="py-1 pr-4 font-medium">{{ 'ai.spend.col.provider' | transloco }}</th>
                    <th class="py-1 pr-4 text-right font-medium">
                      {{ 'ai.spend.col.calls' | transloco }}
                    </th>
                    <th class="py-1 pr-4 text-right font-medium">
                      {{ 'ai.spend.col.tokens' | transloco }}
                    </th>
                    <th class="py-1 pr-4 text-right font-medium">
                      {{ 'ai.spend.col.cache' | transloco }}
                    </th>
                    <th class="py-1 pr-4 text-right font-medium">
                      {{ 'ai.spend.col.audio' | transloco }}
                    </th>
                    <th class="py-1 pr-4 text-right font-medium">
                      {{ 'ai.spend.col.characters' | transloco }}
                    </th>
                    <th class="py-1 pr-4 text-right font-medium">
                      {{ 'ai.spend.col.cost' | transloco }}
                    </th>
                    <th class="py-1 text-right font-medium">
                      {{ 'ai.spend.col.share' | transloco }}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  @for (row of data.rows(); track row.modelId) {
                    <tr
                      class="border-border border-t align-top"
                      [class.text-muted-color]="row.calls === 0"
                      data-testid="spend-row"
                      [attr.data-model]="row.modelId"
                    >
                      <td class="py-2 pr-4">
                        <div class="flex flex-wrap items-center gap-2">
                          @if (row.byCapability.length > 0) {
                            <button
                              type="button"
                              class="text-muted-color hover:text-fg"
                              data-testid="spend-row-toggle"
                              [attr.aria-expanded]="isOpen(row.modelId)"
                              [attr.aria-label]="
                                'ai.spend.byAgent' | transloco: { model: row.name }
                              "
                              (click)="toggle(row.modelId)"
                            >
                              <i
                                class="pi"
                                [class.pi-chevron-down]="isOpen(row.modelId)"
                                [class.pi-chevron-right]="!isOpen(row.modelId)"
                                aria-hidden="true"
                              ></i>
                            </button>
                          }
                          <span class="font-medium">{{ row.name }}</span>
                          @if (row.modality) {
                            <p-tag severity="secondary" [value]="row.modality" />
                          }
                          @if (row.removed) {
                            <p-tag severity="secondary" [value]="'ai.spend.removed' | transloco" />
                          } @else if (row.status && row.status !== 'active') {
                            <p-tag
                              [severity]="row.status === 'disabled' ? 'danger' : 'warn'"
                              [value]="'ai.models.status.' + row.status | transloco"
                            />
                          }
                        </div>
                        @if (row.boundTo.length > 0) {
                          <div class="text-muted-color font-mono text-xs" data-testid="spend-bound">
                            @for (b of row.boundTo; track b.capability + b.role) {
                              <span class="mr-2"
                                >{{ 'ai.spend.role.' + b.role | transloco }}:
                                {{ b.capability }}</span
                              >
                            }
                          </div>
                        } @else if (row.calls === 0) {
                          <div class="text-muted-color text-xs">
                            {{ 'ai.spend.idle' | transloco }}
                          </div>
                        }
                      </td>
                      <td class="py-2 pr-4">
                        {{ row.providerName ?? '—' }}
                        @if (row.region) {
                          <span class="text-muted-color text-xs">· {{ row.region }}</span>
                        }
                      </td>
                      <ng-container
                        [ngTemplateOutlet]="figureCells"
                        [ngTemplateOutletContext]="{ $implicit: row }"
                      />
                    </tr>
                    @if (isOpen(row.modelId)) {
                      @for (c of row.byCapability; track c.capability) {
                        <tr
                          class="border-border bg-surface-50 dark:bg-surface-900 border-t text-xs"
                          data-testid="spend-capability-row"
                          [attr.data-capability]="c.capability"
                        >
                          <td class="py-1 pr-4 pl-8 font-mono" colspan="2">{{ c.capability }}</td>
                          <ng-container
                            [ngTemplateOutlet]="figureCells"
                            [ngTemplateOutletContext]="{ $implicit: c }"
                          />
                        </tr>
                      }
                    }
                  }
                </tbody>
              </table>
            </div>
          }

          <ng-template #figureCells let-f>
            <td class="py-2 pr-4 text-right tabular-nums" data-testid="spend-calls">
              {{ f.calls | number }}
              @if (f.failed > 0) {
                <div class="text-xs text-red-600 dark:text-red-400">
                  {{ 'ai.spend.failedCalls' | transloco: { count: f.failed } }}
                </div>
              }
              @if (f.fallbackCalls > 0) {
                <div class="text-muted-color text-xs">
                  {{ 'ai.spend.fallbackCalls' | transloco: { count: f.fallbackCalls } }}
                </div>
              }
            </td>
            <td class="py-2 pr-4 text-right tabular-nums" data-testid="spend-tokens">
              @if (f.inputTokens + f.outputTokens > 0) {
                {{ f.inputTokens | number }} / {{ f.outputTokens | number }}
              } @else {
                —
              }
            </td>
            <td class="py-2 pr-4 text-right tabular-nums">
              @if (f.cacheReadTokens + f.cacheWriteTokens > 0) {
                {{ f.cacheReadTokens | number }} / {{ f.cacheWriteTokens | number }}
              } @else {
                —
              }
            </td>
            <td class="py-2 pr-4 text-right tabular-nums" data-testid="spend-audio">
              {{ f.audioMs > 0 ? (hours(f.audioMs) | number: '1.0-2') : '—' }}
            </td>
            <td class="py-2 pr-4 text-right tabular-nums" data-testid="spend-characters">
              {{ f.characters > 0 ? (f.characters | number) : '—' }}
            </td>
            <td class="py-2 pr-4 text-right tabular-nums" data-testid="spend-cost">
              {{ costOf(f) }}
              @for (m of f.other; track m.currency) {
                <div class="text-xs">+ {{ moneyOf(m.amount, m.currency) }}</div>
              }
              @if (f.unpricedCalls > 0) {
                <div
                  class="text-xs text-amber-600 dark:text-amber-400"
                  data-testid="spend-unpriced"
                >
                  <i class="pi pi-exclamation-triangle" aria-hidden="true"></i>
                  {{ 'ai.spend.unpricedCalls' | transloco: { count: f.unpricedCalls } }}
                </div>
              }
            </td>
            <td class="py-2 text-right tabular-nums" data-testid="spend-share">
              {{ f.share === null ? '—' : (f.share | percent: '1.0-1') }}
            </td>
          </ng-template>

          <!-- Cost per day -->
          @if (data.chart(); as chart) {
            <section
              class="border-border flex flex-col gap-2 rounded-md border p-4"
              data-testid="spend-daily"
            >
              <h3 class="text-sm font-semibold">{{ 'ai.spend.daily' | transloco }}</h3>
              @if (chart.series.length === 0) {
                <p class="text-muted-color text-sm" data-testid="spend-chart-empty">
                  {{ 'ai.spend.chartEmpty' | transloco }}
                </p>
              } @else {
                <app-spend-chart [chart]="chart" [label]="'ai.spend.daily' | transloco" />
              }
              @if (chart.otherCurrency) {
                <p class="text-muted-color text-xs" data-testid="spend-chart-currency">
                  {{ 'ai.spend.chartUsdOnly' | transloco }}
                </p>
              }
            </section>
          }
        }
      }

      <hr class="border-border" />
      <app-payer-spend />
    </section>
  `,
})
export class AiSpendPage {
  protected readonly data = inject(AiSpendData);
  private readonly payers = inject(PayerSpendData);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly lang = inject(LanguageService).current;

  protected readonly presets = SPEND_PRESETS;
  private readonly open = signal<ReadonlySet<string>>(new Set());
  /** A hand-picked range the server would refuse; the URL is not changed. */
  protected readonly rangeRefused = signal(false);

  protected readonly hours = audioHours;

  /** Both blocks: the ledger per model and the credits per payer. */
  protected reload(): void {
    this.data.reload();
    this.payers.reloadAll();
  }

  protected money(micros: number): string {
    return formatMoney(micros, MAIN_CURRENCY, this.lang());
  }

  protected moneyOf(amount: string, currency: string): string {
    return formatMoney(Math.round(Number(amount) * 1_000_000), currency, this.lang());
  }

  /**
   * USD of a row. Zero shows as money only when every call was priced (a free local model);
   * a row with no priced call, no call at all or only another currency has no USD figure.
   */
  protected costOf(f: SpendFigures): string {
    if (f.usdMicros > 0) return this.money(f.usdMicros);
    const allPriced = f.calls > 0 && f.unpricedCalls === 0 && f.other.length === 0;
    return allPriced ? this.money(0) : '—';
  }

  protected isOpen(modelId: string): boolean {
    return this.open().has(modelId);
  }

  protected toggle(modelId: string): void {
    this.open.update((set) => {
      const next = new Set(set);
      if (!next.delete(modelId)) next.add(modelId);
      return next;
    });
  }

  protected setPreset(preset: SpendPreset): void {
    this.rangeRefused.set(false);
    this.navigate(presetParams(preset));
  }

  protected setRange(from: string, to: string): void {
    const valid = isValidRange(from, to);
    this.rangeRefused.set(!valid);
    if (valid) this.navigate({ from, to });
  }

  private navigate(params: { from: string | null; to: string | null }): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: params,
      queryParamsHandling: 'merge',
    });
  }
}
