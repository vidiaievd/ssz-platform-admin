import { Component, computed, inject, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { ButtonDirective } from 'primeng/button';
import { Tag } from 'primeng/tag';
import { AssistCaseResultDto } from '../../../api/ai/models/assist-case-result-dto';
import { AssistRunScoresDto } from '../../../api/ai/models/assist-run-scores-dto';
import { CaseResultDto } from '../../../api/ai/models/case-result-dto';
import { ReadingCaseResultDto } from '../../../api/ai/models/reading-case-result-dto';
import { LanguageService } from '../../../core/i18n/language.service';
import { formatMoment } from '../../schools/card/journal/journal-format';
import { EvalRunDetail } from './ai-evals.data';
import { formatCost, formatElapsed, formatMetric, shortId } from './eval-format';
import {
  EvalSet,
  Metric,
  countEntries,
  readingCaseLine,
  scoreGroups,
  voiceGate,
} from './eval-sets';

/**
 * The card of one run: who started it and on what (model, prompt version, the binding then and
 * how it stands against today's), what it cost, which cases the set left out and why, every score
 * grouped, and the cases one by one. A run keeps no text — the cases are counts and verdicts.
 */
@Component({
  selector: 'app-eval-run-card',
  imports: [TranslocoPipe, ButtonDirective, Tag],
  template: `
    @let r = run();
    <article
      class="border-border flex flex-col gap-4 rounded-lg border p-4"
      [attr.data-run]="r.id"
      data-testid="eval-run-card"
    >
      <header class="flex flex-wrap items-start gap-3">
        <div class="flex min-w-0 flex-1 flex-col gap-1">
          <div class="flex flex-wrap items-center gap-2">
            <h3 class="text-base font-semibold" data-testid="eval-card-model">
              {{ modelName(r.modelId) }}
            </h3>
            <span class="text-muted-color font-mono text-xs">{{ r.promptVersion }}</span>
            @if (set() === 'voice_review') {
              <p-tag severity="secondary" [value]="r.capability" />
            }
            <p-tag
              data-testid="eval-card-status"
              [severity]="statusSeverity(r.status)"
              [value]="'ai.evals.status.' + r.status | transloco"
            />
            @if (r.matchesBinding) {
              <p-tag
                severity="info"
                data-testid="eval-card-binding"
                [value]="'ai.evals.matches.' + r.matchesBinding | transloco"
              />
            }
          </div>
          <dl class="text-muted-color grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-xs">
            <dt>{{ 'ai.evals.card.started' | transloco }}</dt>
            <dd>
              {{ moment(r.startedAt) }} ·
              <span class="font-mono" [attr.title]="r.startedBy">{{ short(r.startedBy) }}</span>
            </dd>
            <dt>{{ 'ai.evals.card.duration' | transloco }}</dt>
            <dd class="tabular-nums" data-testid="eval-card-duration">
              {{ elapsed(r.startedAt, r.finishedAt) }}
            </dd>
            <dt>{{ 'ai.evals.card.cost' | transloco }}</dt>
            <dd class="tabular-nums" data-testid="eval-card-cost">
              {{ cost(r) }}
              @if (r.credits) {
                · {{ 'ai.providers.test.credits' | transloco: { credits: r.credits } }}
              }
            </dd>
            <dt>{{ 'ai.evals.card.bindingAtStart' | transloco }}</dt>
            <dd data-testid="eval-card-binding-at-start">
              @if (r.bindingAtStart; as b) {
                {{ modelName(b.primaryModelId) }}
                @if (b.fallbackModelId) {
                  → {{ modelName(b.fallbackModelId) }}
                }
                · <span class="font-mono">{{ b.promptVersion }}</span>
              } @else {
                {{ 'ai.evals.unbound' | transloco }}
              }
            </dd>
            <dt>{{ 'ai.evals.card.runId' | transloco }}</dt>
            <dd class="font-mono break-all">{{ r.id }}</dd>
          </dl>
        </div>
        <button
          pButton
          type="button"
          size="small"
          severity="secondary"
          [text]="true"
          data-testid="eval-card-close"
          (click)="closed.emit()"
        >
          <i class="pi pi-times" aria-hidden="true"></i>
          {{ 'ai.evals.card.close' | transloco }}
        </button>
      </header>

      @if (r.error) {
        <div
          role="alert"
          class="rounded-md border border-red-300 px-3 py-2 text-sm dark:border-red-800"
          data-testid="eval-card-error"
        >
          <i class="pi pi-exclamation-triangle text-red-500" aria-hidden="true"></i>
          {{ r.error }}
        </div>
      }

      @if (skipped().length > 0) {
        <div class="text-sm" data-testid="eval-card-skipped">
          <span class="font-medium">
            {{ 'ai.evals.card.skipped.' + set() | transloco: { count: skippedTotal() } }}
          </span>
          <span class="text-muted-color">
            @for (entry of skipped(); track entry[0]; let last = $last) {
              <span class="font-mono">{{ entry[0] }}</span> {{ entry[1] }}{{ last ? '' : ',' }}
            }
          </span>
        </div>
      }

      @if (r.status === 'running') {
        <p class="text-muted-color flex items-center gap-2 text-sm" data-testid="eval-card-running">
          <i class="pi pi-spin pi-spinner" aria-hidden="true"></i>
          {{ 'ai.evals.card.running' | transloco: { count: r.caseCount } }}
        </p>
      }

      @if (gate(); as gate) {
        <div
          class="flex flex-wrap items-center gap-2 text-sm"
          data-testid="eval-card-gate"
          [attr.data-met]="gate.met"
        >
          <p-tag
            [severity]="gate.met ? 'success' : 'warn'"
            [value]="(gate.met ? 'ai.evals.gate.met' : 'ai.evals.gate.notMet') | transloco"
          />
          <span class="text-muted-color text-xs">
            {{
              'ai.evals.gate.rule'
                | transloco
                  : {
                      prompts: gate.minPrompts,
                      agreement: format({ value: gate.minAgreement, format: 'rate' }),
                    }
            }}
          </span>
        </div>
      }

      @if (groups().length > 0) {
        <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" data-testid="eval-card-scores">
          @for (group of groups(); track group.key) {
            <section class="flex flex-col gap-1">
              <h4 class="text-sm font-semibold">{{ 'ai.evals.group.' + group.key | transloco }}</h4>
              <dl class="grid grid-cols-[1fr_auto] gap-x-4 gap-y-0.5 text-sm">
                @for (m of group.metrics; track m.key) {
                  <dt class="text-muted-color">
                    {{ 'ai.evals.metric.' + m.key | transloco }}
                    @if (m.better === 'lower') {
                      <span class="text-xs" [attr.title]="'ai.evals.lowerBetter' | transloco"
                        >↓</span
                      >
                    }
                  </dt>
                  <dd class="text-right tabular-nums" [attr.data-metric]="m.key">
                    {{ format(m) }}
                  </dd>
                }
              </dl>
            </section>
          }
          @if (silentByCause().length > 0) {
            <section class="flex flex-col gap-1" data-testid="eval-card-silent-causes">
              <h4 class="text-sm font-semibold">
                {{ 'ai.evals.group.silentByCause' | transloco }}
              </h4>
              <dl class="grid grid-cols-[1fr_auto] gap-x-4 gap-y-0.5 text-sm">
                @for (entry of silentByCause(); track entry[0]) {
                  <dt class="text-muted-color font-mono text-xs">{{ entry[0] }}</dt>
                  <dd class="text-right tabular-nums">{{ entry[1] }}</dd>
                }
              </dl>
            </section>
          }
        </div>
      }

      @if (r.cases; as cases) {
        <details class="text-sm" data-testid="eval-card-cases">
          <summary class="cursor-pointer font-medium">
            {{ 'ai.evals.card.cases' | transloco: { count: cases.length } }}
          </summary>
          <div class="relative mt-2 overflow-x-auto">
            @switch (set()) {
              @case ('review_draft') {
                <table class="w-full min-w-[48rem] text-xs" data-testid="eval-cases-review">
                  <thead class="text-muted-color text-left">
                    <tr>
                      <th class="py-1 pr-3 font-medium">
                        {{ 'ai.evals.case.attempt' | transloco }}
                      </th>
                      <th class="py-1 pr-3 font-medium">
                        {{ 'ai.evals.case.outcome' | transloco }}
                      </th>
                      <th class="py-1 pr-3 text-right font-medium">
                        {{ 'ai.evals.case.found' | transloco }}
                      </th>
                      <th class="py-1 pr-3 text-right font-medium">
                        {{ 'ai.evals.case.repeated' | transloco }}
                      </th>
                      <th class="py-1 pr-3 text-right font-medium">
                        {{ 'ai.evals.case.remarks' | transloco }}
                      </th>
                      <th class="py-1 pr-3 text-right font-medium">
                        {{ 'ai.evals.case.sentences' | transloco }}
                      </th>
                      <th class="py-1 pr-3 text-right font-medium">
                        {{ 'ai.evals.case.marks' | transloco }}
                      </th>
                      <th class="py-1 text-right font-medium">
                        {{ 'ai.evals.case.latency' | transloco }}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (c of reviewCases(cases); track c.caseId) {
                      <tr class="border-border border-t" data-testid="eval-case">
                        <td class="py-1 pr-3 font-mono" [attr.title]="c.caseId">
                          {{ short(c.caseId) }}
                        </td>
                        <td class="py-1 pr-3">
                          <span [class]="outcomeClass(c.outcome)">{{
                            'ai.evals.outcome.' + c.outcome | transloco
                          }}</span>
                          @if (c.errorCode) {
                            <span class="font-mono"> · {{ c.errorCode }}</span>
                          }
                        </td>
                        @if (c.score; as s) {
                          <td class="py-1 pr-3 text-right tabular-nums">
                            {{ s.confirmedFound }} / {{ s.confirmed }}
                          </td>
                          <td class="py-1 pr-3 text-right tabular-nums">
                            {{ s.rejectedRepeated }} / {{ s.rejected }}
                          </td>
                          <td class="py-1 pr-3 text-right tabular-nums">{{ s.remarks.length }}</td>
                          <td class="py-1 pr-3 text-right tabular-nums">
                            {{ s.sentencesAgreed }} / {{ s.sentences }}
                          </td>
                          <td class="py-1 pr-3 text-right tabular-nums">
                            @if (s.marksCompared + s.marksMissing > 0) {
                              {{ s.marksSame }} / {{ s.marksCompared }}
                              @if (s.marksMissing) {
                                <span class="text-muted-color">(+{{ s.marksMissing }})</span>
                              }
                            } @else {
                              —
                            }
                          </td>
                        } @else {
                          <td colspan="5" class="text-muted-color py-1 pr-3 text-right">—</td>
                        }
                        <td class="py-1 text-right tabular-nums">
                          {{ format({ value: c.latencyMs, format: 'ms' }) }}
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              }
              @case ('voice_review') {
                <table class="w-full min-w-[48rem] text-xs" data-testid="eval-cases-voice">
                  <thead class="text-muted-color text-left">
                    <tr>
                      <th class="py-1 pr-3 font-medium">
                        {{ 'ai.evals.case.attempt' | transloco }}
                      </th>
                      <th class="py-1 pr-3 text-right font-medium">
                        {{ 'ai.evals.case.passPercent' | transloco }}
                      </th>
                      <th class="py-1 pr-3 text-right font-medium">
                        {{ 'ai.evals.case.heard' | transloco }}
                      </th>
                      <th class="py-1 pr-3 text-right font-medium">
                        {{ 'ai.evals.case.agreed' | transloco }}
                      </th>
                      <th class="py-1 pr-3 text-right font-medium">
                        {{ 'ai.evals.metric.falsePass' | transloco }}
                      </th>
                      <th class="py-1 pr-3 text-right font-medium">
                        {{ 'ai.evals.metric.falseFail' | transloco }}
                      </th>
                      <th class="py-1 text-right font-medium">
                        {{ 'ai.evals.case.notHeard' | transloco }}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (c of readingCases(cases); track c.caseId) {
                      <tr class="border-border border-t" data-testid="eval-case">
                        <td class="py-1 pr-3 font-mono" [attr.title]="c.caseId">
                          {{ short(c.caseId) }}
                        </td>
                        <td class="py-1 pr-3 text-right tabular-nums">{{ c.passPercent }} %</td>
                        <td class="py-1 pr-3 text-right tabular-nums">
                          {{ c.heard }} / {{ c.prompts }}
                        </td>
                        <td class="py-1 pr-3 text-right tabular-nums">{{ c.agreed }}</td>
                        <td
                          class="py-1 pr-3 text-right tabular-nums"
                          [class.text-red-600]="c.falsePass > 0"
                        >
                          {{ c.falsePass }}
                        </td>
                        <td
                          class="py-1 pr-3 text-right tabular-nums"
                          [class.text-amber-700]="c.falseFail > 0"
                        >
                          {{ c.falseFail }}
                        </td>
                        <td class="py-1 text-right tabular-nums">
                          {{ c.errors + c.skipped }}
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              }
              @case ('student_assist') {
                <table class="w-full min-w-[56rem] text-xs" data-testid="eval-cases-assist">
                  <thead class="text-muted-color text-left">
                    <tr>
                      <th class="py-1 pr-3 font-medium">{{ 'ai.evals.case.case' | transloco }}</th>
                      <th class="py-1 pr-3 font-medium">
                        {{ 'ai.evals.case.category' | transloco }}
                      </th>
                      <th class="py-1 pr-3 font-medium">
                        {{ 'ai.evals.case.outcome' | transloco }}
                      </th>
                      <th class="py-1 pr-3 font-medium">
                        {{ 'ai.evals.case.verdict' | transloco }}
                      </th>
                      <th class="py-1 pr-3 font-medium">
                        {{ 'ai.evals.case.rejections' | transloco }}
                      </th>
                      <th class="py-1 pr-3 text-right font-medium">
                        {{ 'ai.evals.case.rounds' | transloco }}
                      </th>
                      <th class="py-1 text-right font-medium">
                        {{ 'ai.evals.case.latency' | transloco }}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (c of assistCases(cases); track c.caseKey) {
                      <tr class="border-border border-t" data-testid="eval-case">
                        <td class="py-1 pr-3 font-mono">{{ c.caseKey }}</td>
                        <td class="py-1 pr-3">
                          {{ 'ai.evals.category.' + c.category | transloco }}
                        </td>
                        <td class="py-1 pr-3">
                          {{ 'ai.evals.outcome.' + c.outcome | transloco }}
                          @if (c.cause) {
                            <span class="font-mono"> · {{ c.cause }}</span>
                          }
                        </td>
                        <td class="py-1 pr-3" data-testid="eval-case-verdict">
                          @switch (assistVerdict(c)) {
                            @case ('leaked') {
                              <span class="text-red-600 dark:text-red-400">{{
                                'ai.evals.verdict.leaked' | transloco
                              }}</span>
                            }
                            @case ('cited') {
                              <span class="text-green-700 dark:text-green-400">{{
                                'ai.evals.verdict.cited' | transloco
                              }}</span>
                            }
                            @case ('notCited') {
                              <span class="text-amber-700 dark:text-amber-400">{{
                                'ai.evals.verdict.notCited' | transloco
                              }}</span>
                            }
                            @case ('held') {
                              <span class="text-green-700 dark:text-green-400">{{
                                'ai.evals.verdict.held' | transloco
                              }}</span>
                            }
                            @default {
                              <span class="text-muted-color">—</span>
                            }
                          }
                        </td>
                        <td class="py-1 pr-3 font-mono">
                          {{ c.rejections.length > 0 ? c.rejections.join(', ') : '—' }}
                        </td>
                        <td class="py-1 pr-3 text-right tabular-nums">
                          {{ c.toolRounds }} / {{ c.calls }}
                        </td>
                        <td class="py-1 text-right tabular-nums">
                          {{ format({ value: c.latencyMs, format: 'ms' }) }}
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              }
            }
          </div>
        </details>
      }
    </article>
  `,
})
export class EvalRunCard {
  readonly set = input.required<EvalSet>();
  readonly run = input.required<EvalRunDetail>();
  readonly modelNames = input<ReadonlyMap<string, string>>(new Map());
  readonly closed = output<void>();

  private readonly lang = inject(LanguageService).current;

  protected readonly groups = computed(() => scoreGroups(this.set(), this.run().scores));
  protected readonly gate = computed(() => voiceGate(this.set(), this.run().scores));
  protected readonly skipped = computed(() => countEntries(this.run().skipped));
  protected readonly skippedTotal = computed(() =>
    this.skipped().reduce((sum, [, n]) => sum + n, 0),
  );
  protected readonly silentByCause = computed(() =>
    this.set() === 'student_assist' && this.run().scores
      ? countEntries((this.run().scores as AssistRunScoresDto).silentByCause)
      : [],
  );

  protected modelName(id: string): string {
    return this.modelNames().get(id) ?? id;
  }

  protected moment(iso: string): string {
    return formatMoment(iso, this.lang());
  }

  protected elapsed(startedAt: string, finishedAt: string | null): string {
    return formatElapsed(startedAt, finishedAt);
  }

  protected cost(r: EvalRunDetail): string {
    return formatCost(r.cost, this.lang());
  }

  protected format(m: Pick<Metric, 'value' | 'format'>): string {
    return formatMetric(m, this.lang());
  }

  protected short(id: string): string {
    return shortId(id);
  }

  protected statusSeverity(status: EvalRunDetail['status']): 'info' | 'success' | 'danger' {
    return status === 'done' ? 'success' : status === 'failed' ? 'danger' : 'info';
  }

  protected outcomeClass(outcome: string): string {
    return outcome === 'ok' ? '' : 'text-red-600 dark:text-red-400';
  }

  protected reviewCases(cases: unknown[]): CaseResultDto[] {
    return cases as CaseResultDto[];
  }

  protected readingCases(cases: unknown[]) {
    return (cases as ReadingCaseResultDto[]).map(readingCaseLine);
  }

  protected assistCases(cases: unknown[]): AssistCaseResultDto[] {
    return cases as AssistCaseResultDto[];
  }

  /** What a case shows of its category's rule: a leak, a citation, restraint. */
  protected assistVerdict(c: AssistCaseResultDto): 'leaked' | 'cited' | 'notCited' | 'held' | null {
    if (c.saidForbidden) return 'leaked';
    if (c.category === 'grounded' && c.expectedCited !== null) {
      return c.expectedCited ? 'cited' : 'notCited';
    }
    if (c.category === 'key_seeking' && c.saidForbidden === false) return 'held';
    return null;
  }
}
