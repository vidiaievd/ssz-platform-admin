import { DecimalPipe, PercentPipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { ButtonDirective } from 'primeng/button';
import { Skeleton } from 'primeng/skeleton';
import { Tag } from 'primeng/tag';
import { ModelRef } from '../models/agent-binding-rows';
import { GATE_PRESETS, GatePreset, gatePresetRange, isValidGateRange } from './gate-period';
import { GateVerdict } from './review-gate-model';
import { ReviewGateData } from './review-gate.data';

const VERDICT_SEVERITY: Record<GateVerdict, 'success' | 'danger' | 'secondary' | 'warn'> = {
  passed: 'success',
  failed: 'danger',
  insufficient: 'secondary',
  not_recorded: 'warn',
};

/**
 * `/ai/gate` — "AI → Q2 gate" (plan 90, phase 7, step 16): per exercise template × model, how
 * teachers settled the model's drafts against the gate of plan 79, with the model bound to
 * `review_direct` marked. Read only: there is no switch (Q6, option C) — admitting templates to
 * `review_direct` is a later plan, and until then `ai.review_direct` stays out of every tariff.
 */
@Component({
  selector: 'app-review-gate-page',
  providers: [ReviewGateData],
  imports: [DecimalPipe, PercentPipe, TranslocoPipe, ButtonDirective, Skeleton, Tag],
  template: `
    <section class="flex flex-col gap-4" data-testid="ai-gate">
      <div class="flex flex-wrap items-center gap-2">
        <h2 class="text-base font-semibold">{{ 'ai.gate.title' | transloco }}</h2>
        <div
          class="ml-auto flex flex-wrap items-center gap-2"
          role="group"
          [attr.aria-label]="'ai.gate.period' | transloco"
        >
          @for (p of presets; track p) {
            <button
              type="button"
              pButton
              size="small"
              [severity]="p === data.preset() ? 'primary' : 'secondary'"
              [outlined]="p !== data.preset()"
              [attr.aria-pressed]="p === data.preset()"
              [attr.data-testid]="'gate-preset-' + p"
              (click)="setPreset(p)"
            >
              {{ 'ai.gate.presets.' + p | transloco }}
            </button>
          }
          <label class="flex items-center gap-1 text-xs">
            <span class="text-muted-color">{{ 'ai.gate.from' | transloco }}</span>
            <input
              type="date"
              class="border-border rounded border bg-transparent px-1 py-0.5 text-sm"
              data-testid="gate-from"
              [value]="data.range().from ?? ''"
              [max]="data.range().to ?? ''"
              (change)="setRange($any($event.target).value, data.range().to)"
            />
          </label>
          <label class="flex items-center gap-1 text-xs">
            <span class="text-muted-color">{{ 'ai.gate.to' | transloco }}</span>
            <input
              type="date"
              class="border-border rounded border bg-transparent px-1 py-0.5 text-sm"
              data-testid="gate-to"
              [value]="data.range().to ?? ''"
              [min]="data.range().from ?? ''"
              (change)="setRange(data.range().from, $any($event.target).value)"
            />
          </label>
          <button
            type="button"
            pButton
            size="small"
            severity="secondary"
            data-testid="gate-refresh"
            [attr.aria-label]="'ai.gate.refresh' | transloco"
            (click)="data.reload()"
          >
            <i class="pi pi-refresh" aria-hidden="true"></i>
          </button>
        </div>
      </div>

      <p
        class="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-700 dark:bg-amber-950"
        role="note"
        data-testid="gate-tariff-warning"
      >
        <i class="pi pi-exclamation-triangle mt-0.5 text-amber-500" aria-hidden="true"></i>
        <span>{{ 'ai.gate.tariffWarning' | transloco }}</span>
      </p>

      @if (rangeRefused()) {
        <p
          class="text-sm text-red-600 dark:text-red-400"
          role="alert"
          data-testid="gate-range-refused"
        >
          {{ 'ai.gate.rangeRefused' | transloco }}
        </p>
      }

      <!-- The binding the gate is about -->
      <div class="text-sm" data-testid="gate-binding">
        @switch (data.binding().kind) {
          @case ('loading') {
            <p-skeleton width="20rem" height="1.25rem" />
          }
          @case ('error') {
            <span role="alert" data-testid="gate-binding-failed">
              {{ 'ai.gate.bindingFailed' | transloco }} ·
              <button type="button" class="text-primary underline" (click)="data.reloadBinding()">
                {{ 'schools.retry' | transloco }}
              </button>
            </span>
          }
          @case ('unbound') {
            <span class="text-muted-color" data-testid="gate-unbound">
              {{ 'ai.gate.unbound' | transloco }}
            </span>
          }
          @default {
            @if (bound(); as b) {
              <span>
                {{ 'ai.gate.boundTo' | transloco }}
                <strong data-testid="gate-bound-primary">{{ nameOf(b.primary) }}</strong>
                @if (b.fallback) {
                  <span class="text-muted-color" data-testid="gate-bound-fallback">
                    · {{ 'ai.gate.fallback' | transloco: { model: nameOf(b.fallback) } }}
                  </span>
                }
              </span>
            }
          }
        }
      </div>

      @switch (data.gate().kind) {
        @case ('loading') {
          <p-skeleton height="3rem" />
          <p-skeleton height="12rem" />
        }
        @case ('error') {
          <p class="text-sm" role="alert" data-testid="gate-failed">
            {{ 'ai.gate.failed' | transloco }} ·
            <button type="button" class="text-primary underline" (click)="data.reload()">
              {{ 'schools.retry' | transloco }}
            </button>
          </p>
        }
        @default {
          @if (thresholds(); as t) {
            <p class="text-muted-color text-sm" data-testid="gate-thresholds">
              {{
                'ai.gate.thresholds'
                  | transloco
                    : {
                        drafts: t.minDrafts,
                        kept: (t.minKept | percent: '1.0-1'),
                        discarded: (t.maxDiscarded | percent: '1.0-1'),
                      }
              }}
            </p>
          }

          @let s = data.summary();
          <div
            class="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm"
            data-testid="gate-summary"
          >
            <span>{{ 'ai.gate.summary.templates' | transloco: { count: s.templates } }}</span>
            @if (s.bound; as b) {
              <span data-testid="gate-summary-bound">
                {{ 'ai.gate.summary.bound' | transloco }}
                <p-tag severity="success" [value]="'ai.gate.verdict.passed' | transloco" />
                <span class="tabular-nums" data-testid="gate-count-passed">{{ b.passed }}</span>
                ·
                <p-tag severity="danger" [value]="'ai.gate.verdict.failed' | transloco" />
                <span class="tabular-nums" data-testid="gate-count-failed">{{ b.failed }}</span>
                ·
                <p-tag severity="secondary" [value]="'ai.gate.verdict.insufficient' | transloco" />
                <span class="tabular-nums" data-testid="gate-count-insufficient">{{
                  b.insufficient
                }}</span>
              </span>
            }
            @if (s.notRecordedDrafts > 0) {
              <span class="text-muted-color" data-testid="gate-summary-not-recorded">
                {{ 'ai.gate.summary.notRecorded' | transloco: { count: s.notRecordedDrafts } }}
              </span>
            }
            @if (data.binding().kind === 'bound') {
              <label class="ml-auto flex items-center gap-2">
                <input
                  type="checkbox"
                  data-testid="gate-bound-only"
                  [checked]="data.boundOnly()"
                  (change)="setBoundOnly($any($event.target).checked)"
                />
                {{ 'ai.gate.boundOnly' | transloco }}
              </label>
            }
          </div>

          @if (data.visible().length === 0) {
            <p class="text-sm" data-testid="gate-empty">
              {{ (data.rows().length === 0 ? 'ai.gate.empty' : 'ai.gate.emptyBound') | transloco }}
            </p>
          } @else {
            <div class="overflow-x-auto">
              <table class="w-full min-w-[60rem] text-sm" data-testid="gate-table">
                <thead class="text-muted-color text-left">
                  <tr>
                    <th class="py-1 pr-4 font-medium">{{ 'ai.gate.col.template' | transloco }}</th>
                    <th class="py-1 pr-4 font-medium">{{ 'ai.gate.col.model' | transloco }}</th>
                    <th class="py-1 pr-4 text-right font-medium">
                      {{ 'ai.gate.col.drafts' | transloco }}
                    </th>
                    <th class="py-1 pr-4 text-right font-medium">
                      {{ 'ai.gate.col.kept' | transloco }}
                    </th>
                    <th class="py-1 pr-4 text-right font-medium">
                      {{ 'ai.gate.col.discarded' | transloco }}
                    </th>
                    <th class="py-1 pr-4 text-right font-medium">
                      {{ 'ai.gate.col.remarks' | transloco }}
                    </th>
                    <th class="py-1 pr-4 text-right font-medium">
                      {{ 'ai.gate.col.direct' | transloco }}
                    </th>
                    <th class="py-1 font-medium">{{ 'ai.gate.col.verdict' | transloco }}</th>
                  </tr>
                </thead>
                <tbody>
                  @for (row of data.visible(); track row.key) {
                    @let g = row.group;
                    <tr
                      class="border-border border-t align-top"
                      [class]="row.role === 'primary' ? 'bg-surface-50 dark:bg-surface-900' : ''"
                      data-testid="gate-row"
                      [attr.data-template]="g.templateCode"
                      [attr.data-model]="g.modelId"
                      [attr.data-role]="row.role"
                    >
                      <td class="py-2 pr-4">
                        @if (g.templateCode) {
                          <span class="font-mono">{{ g.templateCode }}</span>
                        } @else {
                          <span class="text-muted-color italic">{{
                            'ai.gate.notRecorded' | transloco
                          }}</span>
                        }
                      </td>
                      <td class="py-2 pr-4">
                        <div class="flex flex-wrap items-center gap-2">
                          <span>{{ row.model ? nameOf(row.model) : '—' }}</span>
                          @if (row.role) {
                            <p-tag
                              [severity]="row.role === 'primary' ? 'info' : 'secondary'"
                              [value]="'ai.gate.role.' + row.role | transloco"
                              data-testid="gate-role"
                            />
                          }
                        </div>
                      </td>
                      <td
                        class="py-2 pr-4 text-right tabular-nums"
                        [class]="row.checks.drafts ? '' : 'text-muted-color'"
                        data-testid="gate-drafts"
                      >
                        {{ g.drafts | number }}
                      </td>
                      <td
                        class="py-2 pr-4 text-right tabular-nums"
                        [class]="checkClass(row.checks.kept)"
                        data-testid="gate-kept"
                        [attr.data-ok]="row.checks.kept"
                      >
                        {{ g.keptRate === null ? '—' : (g.keptRate | percent: '1.0-1') }}
                      </td>
                      <td
                        class="py-2 pr-4 text-right tabular-nums"
                        [class]="checkClass(row.checks.discarded)"
                        data-testid="gate-discarded"
                        [attr.data-ok]="row.checks.discarded"
                      >
                        {{ g.discardedRate === null ? '—' : (g.discardedRate | percent: '1.0-1') }}
                      </td>
                      <td
                        class="py-2 pr-4 text-right text-xs tabular-nums"
                        data-testid="gate-remarks"
                      >
                        @if (g.remarks.total > 0) {
                          {{
                            'ai.gate.remarks'
                              | transloco
                                : {
                                    accepted: g.remarks.accepted,
                                    edited: g.remarks.edited,
                                    discarded: g.remarks.discarded,
                                    untouched: g.remarks.untouched,
                                  }
                          }}
                        } @else {
                          —
                        }
                      </td>
                      <td
                        class="py-2 pr-4 text-right text-xs tabular-nums"
                        data-testid="gate-direct"
                      >
                        @if (g.direct.reviews > 0 || g.direct.teacherVerdicts > 0) {
                          <div>
                            {{
                              'ai.gate.direct.reviews'
                                | transloco
                                  : {
                                      reviews: g.direct.reviews,
                                      disputes: g.direct.disputes,
                                    }
                            }}
                          </div>
                          @if (g.direct.teacherVerdicts > 0) {
                            <div
                              [class]="
                                g.direct.overturned > 0 ? 'text-red-600 dark:text-red-400' : ''
                              "
                            >
                              {{
                                'ai.gate.direct.overturned'
                                  | transloco
                                    : {
                                        overturned: g.direct.overturned,
                                        verdicts: g.direct.teacherVerdicts,
                                      }
                              }}
                            </div>
                          }
                        } @else {
                          —
                        }
                      </td>
                      <td class="py-2" data-testid="gate-verdict" [attr.data-verdict]="g.verdict">
                        <p-tag
                          [severity]="severity(g.verdict)"
                          [value]="'ai.gate.verdict.' + g.verdict | transloco"
                        />
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            <p class="text-muted-color text-xs" data-testid="gate-legend">
              {{ 'ai.gate.legend' | transloco }}
            </p>
          }
        }
      }
    </section>
  `,
})
export class ReviewGatePage {
  protected readonly data = inject(ReviewGateData);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly presets = GATE_PRESETS;
  /** A hand-picked range the server would refuse; the URL is not changed. */
  protected readonly rangeRefused = signal(false);

  protected bound() {
    const b = this.data.binding();
    return b.kind === 'bound' ? b : null;
  }

  protected thresholds() {
    const g = this.data.gate();
    return g.kind === 'ready' ? g.value.thresholds : null;
  }

  protected nameOf(ref: ModelRef): string {
    return ref.model?.displayName ?? ref.id;
  }

  protected severity(verdict: GateVerdict) {
    return VERDICT_SEVERITY[verdict];
  }

  /** Red when the row misses this threshold; plain when met or not measurable. */
  protected checkClass(ok: boolean | null): string {
    return ok === false ? 'text-red-600 dark:text-red-400' : '';
  }

  protected setPreset(preset: GatePreset): void {
    this.rangeRefused.set(false);
    this.navigate(gatePresetRange(preset));
  }

  protected setRange(from: string | null, to: string | null): void {
    const valid = isValidGateRange(from || null, to || null);
    this.rangeRefused.set(!valid);
    if (valid) this.navigate({ from: from || null, to: to || null });
  }

  protected setBoundOnly(on: boolean): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { bound: on ? '1' : null },
      queryParamsHandling: 'merge',
    });
  }

  private navigate(params: { from: string | null; to: string | null }): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: params,
      queryParamsHandling: 'merge',
    });
  }
}
