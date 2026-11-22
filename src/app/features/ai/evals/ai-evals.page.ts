import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { ButtonDirective } from 'primeng/button';
import { Skeleton } from 'primeng/skeleton';
import { Tag } from 'primeng/tag';
import { IfLevelDirective } from '../../../core/auth/if-level.directive';
import { LanguageService } from '../../../core/i18n/language.service';
import { formatMoment } from '../../schools/card/journal/journal-format';
import { AiEvalsData } from './ai-evals.data';
import { formatCost, formatMetric } from './eval-format';
import { EVAL_RUN_LEVEL, EvalRunDialog } from './eval-run-dialog';
import { EvalRunCard } from './eval-run-card';
import {
  EVAL_SETS,
  EvalSet,
  EvalSummaryDto,
  Metric,
  countEntries,
  headlineMetrics,
  voiceGate,
} from './eval-sets';

/** A run as the table shows it. */
interface RunRow {
  readonly run: EvalSummaryDto;
  readonly metrics: readonly Metric[];
  readonly gateMet: boolean | null;
  readonly skipped: number;
}

/**
 * `/ai/evals` — "AI → Eval" (plan 90, phase 7, step 15). Three sets as sub-tabs (`?set=`): the
 * teachers' settled drafts (`review_draft`), the decided readings (`voice_review`, both voice
 * agents) and the hand-written assistant set (`student_assist`). Each shows today's binding, the
 * runs newest first with their headline scores side by side, and the run opened from the table
 * (`?run=`) as a card. Starting a run is level `admin`; reading is everyone's.
 */
@Component({
  selector: 'app-ai-evals-page',
  providers: [AiEvalsData],
  imports: [
    RouterLink,
    TranslocoPipe,
    ButtonDirective,
    Skeleton,
    Tag,
    IfLevelDirective,
    EvalRunDialog,
    EvalRunCard,
  ],
  template: `
    <section class="flex flex-col gap-3" data-testid="ai-evals">
      <div class="flex flex-wrap items-center gap-2">
        <h2 class="text-base font-semibold">{{ 'ai.evals.title' | transloco }}</h2>
        <div class="ml-auto flex gap-2">
          <button
            pButton
            type="button"
            size="small"
            severity="secondary"
            [text]="true"
            data-testid="evals-refresh"
            (click)="refresh()"
          >
            <i class="pi pi-refresh" aria-hidden="true"></i>
            {{ 'ai.evals.refresh' | transloco }}
          </button>
          <button
            *appIfLevel="runLevel"
            pButton
            type="button"
            size="small"
            data-testid="eval-new-run"
            (click)="runOpen.set(true)"
          >
            <i class="pi pi-play" aria-hidden="true"></i>
            {{ 'ai.evals.newRun' | transloco }}
          </button>
        </div>
      </div>
      <p class="text-muted-color text-sm">{{ 'ai.evals.hint' | transloco }}</p>

      <nav
        class="flex flex-wrap gap-1"
        [attr.aria-label]="'ai.evals.setsLabel' | transloco"
        data-testid="eval-sets"
      >
        @for (s of sets; track s) {
          <a
            class="rounded-md px-3 py-1 text-sm"
            [class]="setClass(s)"
            [attr.aria-current]="s === data.set() ? 'page' : null"
            [routerLink]="[]"
            [queryParams]="{ set: s, run: null }"
            queryParamsHandling="merge"
            [attr.data-testid]="'eval-set-' + s"
          >
            {{ 'ai.evals.set.' + s | transloco }}
          </a>
        }
      </nav>
      <p class="text-muted-color text-xs" data-testid="eval-set-hint">
        {{ 'ai.evals.setHint.' + data.set() | transloco }}
      </p>

      @if (data.models().kind === 'error') {
        <p class="text-sm" role="alert" data-testid="evals-models-failed">
          {{ 'ai.evals.modelsFailed' | transloco }} ·
          <button type="button" class="text-primary underline" (click)="data.reloadRegistry()">
            {{ 'schools.retry' | transloco }}
          </button>
        </p>
      }

      @if (data.run(); as run) {
        @switch (run.kind) {
          @case ('loading') {
            <p-skeleton height="10rem" />
          }
          @case ('error') {
            <p class="text-sm" role="alert" data-testid="eval-run-failed">
              {{ 'ai.evals.runFailed' | transloco }} ·
              <button type="button" class="text-primary underline" (click)="data.reloadRun()">
                {{ 'schools.retry' | transloco }}
              </button>
              ·
              <button type="button" class="text-primary underline" (click)="closeRun()">
                {{ 'ai.evals.card.close' | transloco }}
              </button>
            </p>
          }
          @case ('ready') {
            <app-eval-run-card
              [set]="data.set()"
              [run]="run.value"
              [modelNames]="data.modelNames()"
              (closed)="closeRun()"
            />
          }
        }
      }

      @switch (data.runs().kind) {
        @case ('loading') {
          <p-skeleton height="8rem" />
        }
        @case ('error') {
          <p class="text-sm" role="alert" data-testid="evals-failed">
            {{ 'ai.evals.failed' | transloco }} ·
            <button type="button" class="text-primary underline" (click)="data.reloadRuns()">
              {{ 'schools.retry' | transloco }}
            </button>
          </p>
        }
        @default {
          <div class="flex flex-col gap-1 text-sm" data-testid="eval-bindings">
            @for (b of bindings(); track b.capability) {
              <div class="flex flex-wrap items-center gap-2" [attr.data-capability]="b.capability">
                <span class="text-muted-color">
                  {{ 'ai.evals.bindingToday' | transloco: { capability: b.capability } }}
                </span>
                @if (b.binding; as binding) {
                  <span class="font-medium">{{ modelName(binding.primaryModelId) }}</span>
                  @if (binding.fallbackModelId) {
                    <span class="text-muted-color">
                      → {{ modelName(binding.fallbackModelId) }}
                    </span>
                  }
                  <span class="text-muted-color font-mono text-xs">{{
                    binding.promptVersion
                  }}</span>
                } @else {
                  <p-tag severity="warn" [value]="'ai.evals.unbound' | transloco" />
                }
              </div>
            }
          </div>

          @if (rows().length === 0) {
            <p class="text-muted-color text-sm" data-testid="evals-empty">
              {{ 'ai.evals.empty' | transloco }}
            </p>
          } @else {
            <div class="relative overflow-x-auto">
              <table class="w-full min-w-[64rem] text-sm" data-testid="eval-runs">
                <thead class="text-muted-color text-left">
                  <tr>
                    <th class="py-1 pr-3 font-medium">{{ 'ai.evals.col.started' | transloco }}</th>
                    <th class="py-1 pr-3 font-medium">{{ 'ai.evals.col.model' | transloco }}</th>
                    <th class="py-1 pr-3 font-medium">{{ 'ai.evals.col.status' | transloco }}</th>
                    <th class="py-1 pr-3 text-right font-medium">
                      {{ 'ai.evals.col.cases' | transloco }}
                    </th>
                    @for (m of headline(); track m.key) {
                      <th class="py-1 pr-3 text-right font-medium">
                        {{ 'ai.evals.metric.' + m.key | transloco }}
                        @if (m.better === 'lower') {
                          <span class="text-xs" [attr.title]="'ai.evals.lowerBetter' | transloco"
                            >↓</span
                          >
                        }
                      </th>
                    }
                    @if (data.set() === 'voice_review') {
                      <th class="py-1 pr-3 font-medium">{{ 'ai.evals.col.gate' | transloco }}</th>
                    }
                    <th class="py-1 text-right font-medium">
                      {{ 'ai.evals.col.cost' | transloco }}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  @for (row of rows(); track row.run.id) {
                    <tr
                      class="border-border hover:bg-surface-50 dark:hover:bg-surface-900 cursor-pointer border-t align-top"
                      [class]="row.run.id === data.runId() ? selectedRow : ''"
                      [attr.data-run]="row.run.id"
                      [attr.aria-selected]="row.run.id === data.runId()"
                      data-testid="eval-run-row"
                      (click)="openRun(row.run.id)"
                    >
                      <td class="py-2 pr-3 whitespace-nowrap">
                        <a
                          class="text-primary hover:underline"
                          [routerLink]="[]"
                          [queryParams]="{ run: row.run.id }"
                          queryParamsHandling="merge"
                          data-testid="eval-run-open"
                          (click)="$event.stopPropagation()"
                          >{{ moment(row.run.startedAt) }}</a
                        >
                      </td>
                      <td class="py-2 pr-3">
                        <div class="flex flex-wrap items-center gap-2">
                          <span class="font-medium">{{ modelName(row.run.modelId) }}</span>
                          @if (row.run.matchesBinding) {
                            <p-tag
                              severity="info"
                              [value]="'ai.evals.matches.' + row.run.matchesBinding | transloco"
                            />
                          }
                        </div>
                        <div class="text-muted-color font-mono text-xs">
                          {{ row.run.promptVersion }}
                          @if (data.set() === 'voice_review') {
                            · {{ row.run.capability }}
                          }
                        </div>
                      </td>
                      <td class="py-2 pr-3" data-testid="eval-run-status">
                        <p-tag
                          [severity]="statusSeverity(row.run.status)"
                          [value]="'ai.evals.status.' + row.run.status | transloco"
                        />
                        @if (row.run.error) {
                          <div
                            class="mt-1 max-w-56 truncate text-xs text-red-600 dark:text-red-400"
                            [attr.title]="row.run.error"
                          >
                            {{ row.run.error }}
                          </div>
                        }
                      </td>
                      <td class="py-2 pr-3 text-right tabular-nums" data-testid="eval-run-cases">
                        {{ row.run.caseCount }}
                        @if (row.skipped > 0) {
                          <div
                            class="text-muted-color text-xs"
                            [attr.title]="'ai.evals.skippedTitle' | transloco"
                          >
                            +{{ row.skipped }} {{ 'ai.evals.skippedShort' | transloco }}
                          </div>
                        }
                      </td>
                      @for (m of row.metrics; track m.key) {
                        <td
                          class="py-2 pr-3 text-right tabular-nums"
                          [attr.data-metric]="m.key"
                          [class.font-semibold]="isBest(m)"
                        >
                          {{ format(m) }}
                        </td>
                      }
                      @if (data.set() === 'voice_review') {
                        <td class="py-2 pr-3" data-testid="eval-run-gate">
                          @if (row.gateMet !== null) {
                            <p-tag
                              [severity]="row.gateMet ? 'success' : 'warn'"
                              [value]="
                                (row.gateMet ? 'ai.evals.gate.met' : 'ai.evals.gate.notMet')
                                  | transloco
                              "
                            />
                          } @else {
                            <span class="text-muted-color">—</span>
                          }
                        </td>
                      }
                      <td class="py-2 text-right tabular-nums" data-testid="eval-run-cost">
                        {{ cost(row.run) }}
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            <p class="text-muted-color text-xs">{{ 'ai.evals.bestHint' | transloco }}</p>
          }
        }
      }
    </section>

    <app-eval-run-dialog
      [(visible)]="runOpen"
      [set]="data.set()"
      [bindings]="bindings()"
      [models]="registryModels()"
      [providers]="registryProviders()"
      (started)="started($event)"
    />
  `,
})
export class AiEvalsPage {
  protected readonly data = inject(AiEvalsData);
  private readonly router = inject(Router);
  private readonly lang = inject(LanguageService).current;

  protected readonly sets = EVAL_SETS;
  protected readonly runLevel = EVAL_RUN_LEVEL;
  protected readonly runOpen = signal(false);
  protected readonly selectedRow = 'bg-surface-100 dark:bg-surface-800';

  protected readonly bindings = computed(() => {
    const runs = this.data.runs();
    return runs.kind === 'ready' ? runs.value.bindings : [];
  });

  /** The headline columns of the set (their keys; values are per row). */
  protected readonly headline = computed(() => headlineMetrics(this.data.set(), null));

  protected readonly rows = computed<RunRow[]>(() => {
    const runs = this.data.runs();
    if (runs.kind !== 'ready') return [];
    const set = runs.value.set;
    return runs.value.runs.map((run) => {
      const gate = voiceGate(set, run.scores);
      return {
        run,
        metrics: headlineMetrics(set, run.scores),
        gateMet: gate ? gate.met : null,
        skipped: countEntries(run.skipped).reduce((sum, [, n]) => sum + n, 0),
      };
    });
  });

  /**
   * The best value of each headline column among finished runs on the same set — only shown in
   * bold when at least two runs have a value, so a lone run does not look like a winner.
   */
  private readonly best = computed(() => {
    const best = new Map<string, number>();
    const seen = new Map<string, number>();
    for (const row of this.rows()) {
      if (row.run.status !== 'done') continue;
      for (const m of row.metrics) {
        if (m.value === null || m.better === null) continue;
        seen.set(m.key, (seen.get(m.key) ?? 0) + 1);
        const current = best.get(m.key);
        const better =
          current === undefined || (m.better === 'higher' ? m.value > current : m.value < current);
        if (better) best.set(m.key, m.value);
      }
    }
    for (const [key, n] of seen) if (n < 2) best.delete(key);
    return best;
  });

  protected readonly registryModels = computed(() => {
    const models = this.data.models();
    return models.kind === 'ready' ? models.value : null;
  });
  protected readonly registryProviders = computed(() => {
    const providers = this.data.providers();
    return providers.kind === 'ready' ? providers.value : null;
  });

  protected setClass(set: EvalSet): string {
    return set === this.data.set()
      ? 'bg-primary text-primary-contrast'
      : 'text-muted-color hover:text-fg';
  }

  protected isBest(m: Metric): boolean {
    return m.value !== null && this.best().get(m.key) === m.value;
  }

  protected modelName(id: string): string {
    return this.data.modelNames().get(id) ?? id;
  }

  protected moment(iso: string): string {
    return formatMoment(iso, this.lang());
  }

  protected format(m: Metric): string {
    return formatMetric(m, this.lang());
  }

  protected cost(run: EvalSummaryDto): string {
    return formatCost(run.cost, this.lang());
  }

  protected statusSeverity(status: EvalSummaryDto['status']): 'info' | 'success' | 'danger' {
    return status === 'done' ? 'success' : status === 'failed' ? 'danger' : 'info';
  }

  protected refresh(): void {
    this.data.reloadRuns();
    if (this.data.runId()) this.data.reloadRun();
  }

  protected openRun(runId: string): void {
    this.navigate({ run: runId });
  }

  protected closeRun(): void {
    this.navigate({ run: null });
  }

  /** A run started: the list shows it at the top and its card opens. */
  protected started(run: EvalSummaryDto): void {
    this.data.reloadRuns();
    this.navigate({ run: run.id });
  }

  private navigate(params: { set?: EvalSet; run: string | null }): void {
    void this.router.navigate([], { queryParams: params, queryParamsHandling: 'merge' });
  }
}
