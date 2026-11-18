import { Component, computed, inject, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { ButtonDirective } from 'primeng/button';
import { Skeleton } from 'primeng/skeleton';
import { Tag } from 'primeng/tag';
import { SweepRunDto } from '../../../api/media/models/sweep-run-dto';
import { IfLevelDirective } from '../../../core/auth/if-level.directive';
import { LanguageService } from '../../../core/i18n/language.service';
import { formatMoment } from '../../schools/card/journal/journal-format';
import { MediaSweepsData } from './media-sweeps.data';
import { SweepDeleteDialog } from './sweep-delete-dialog';
import {
  DryRunResult,
  RunOutcome,
  SWEEP_OWNER,
  SweepKind,
  dailyTime,
  formatClock,
  runOutcome,
} from './sweep-model';

const OUTCOME_SEVERITY: Readonly<
  Record<RunOutcome, 'success' | 'warn' | 'danger' | 'info' | 'secondary'>
> = {
  done: 'success',
  running: 'info',
  skipped: 'secondary',
  aborted: 'warn',
  failed: 'danger',
};

/**
 * `/platform/media` — "Platform → Media cleanup" (plan 90, phase 8, step 12): media-service's four
 * nightly sweeps of unused files — schedule, the nightly mode (env `MEDIA_ORPHAN_SWEEP_MODE`, read
 * only, Q7), the last runs. `admin` checks now (a dry run, not journalled); `super` deletes, only
 * on a fresh dry run from this panel, with a reason that lands in the admin journal.
 */
@Component({
  selector: 'app-media-sweeps-page',
  providers: [MediaSweepsData],
  imports: [TranslocoPipe, ButtonDirective, Skeleton, Tag, IfLevelDirective, SweepDeleteDialog],
  template: `
    <section class="flex flex-col gap-4" data-testid="platform-media">
      <div class="flex flex-wrap items-center gap-2">
        <h2 class="text-base font-semibold">{{ 'platform.media.title' | transloco }}</h2>
        <button
          type="button"
          pButton
          size="small"
          severity="secondary"
          class="ml-auto"
          data-testid="media-refresh"
          [attr.aria-label]="'platform.media.refresh' | transloco"
          (click)="data.reload()"
        >
          <i class="pi pi-refresh" aria-hidden="true"></i>
        </button>
      </div>

      <p class="text-muted-color text-sm">{{ 'platform.media.intro' | transloco }}</p>

      @switch (data.state().kind) {
        @case ('loading') {
          <p-skeleton height="1.25rem" width="20rem" />
          @for (i of [1, 2, 3, 4]; track i) {
            <p-skeleton height="9rem" />
          }
        }
        @case ('error') {
          <p class="text-sm" role="alert" data-testid="media-failed">
            {{ 'platform.media.failed' | transloco }} ·
            <button type="button" class="text-primary underline" (click)="data.reload()">
              {{ 'schools.retry' | transloco }}
            </button>
          </p>
        }
        @default {
          @if (nightlyMode(); as mode) {
            <p class="flex flex-wrap items-center gap-2 text-sm" data-testid="media-nightly">
              {{ 'platform.media.nightlyMode' | transloco }}
              <p-tag
                [severity]="mode === 'delete' ? 'danger' : 'secondary'"
                [value]="'platform.media.modes.' + mode | transloco"
                data-testid="media-nightly-mode"
              />
              <span class="text-muted-color text-xs">
                {{ 'platform.media.nightlyModeHint' | transloco }}
              </span>
            </p>
          }
          <p class="text-muted-color text-xs" data-testid="media-history-days">
            {{ 'platform.media.historyDays' | transloco: { days: historyDays() } }}
          </p>

          @for (card of data.cards(); track card.sweep.kind) {
            @let sweep = card.sweep;
            <article
              class="border-border flex flex-col gap-3 rounded-md border p-4"
              data-testid="sweep-card"
              [attr.data-kind]="sweep.kind"
              [attr.aria-labelledby]="'sweep-title-' + sweep.kind"
            >
              <div class="flex flex-wrap items-start gap-2">
                <div class="flex min-w-0 flex-1 flex-col gap-1">
                  <h3 class="text-sm font-semibold" [id]="'sweep-title-' + sweep.kind">
                    {{ 'platform.media.kinds.' + sweep.kind + '.title' | transloco }}
                  </h3>
                  <p class="text-muted-color text-sm">
                    {{ 'platform.media.kinds.' + sweep.kind + '.what' | transloco }}
                  </p>
                </div>
                <div class="flex flex-wrap gap-2">
                  <button
                    *appIfLevel="'admin'"
                    type="button"
                    pButton
                    size="small"
                    severity="secondary"
                    [disabled]="card.checking"
                    data-testid="sweep-check"
                    (click)="data.check(sweep.kind)"
                  >
                    @if (card.checking) {
                      <i class="pi pi-spin pi-spinner" aria-hidden="true"></i>
                    }
                    {{ 'platform.media.check' | transloco }}
                  </button>
                  @if (card.deleteBlocker === null) {
                    <button
                      *appIfLevel="'super'"
                      type="button"
                      pButton
                      size="small"
                      severity="danger"
                      data-testid="sweep-delete"
                      (click)="openDelete(card.dryRun!)"
                    >
                      {{ 'platform.media.delete.open' | transloco }}
                    </button>
                  }
                </div>
              </div>

              <dl
                class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs sm:grid-cols-[auto_1fr_auto_1fr]"
                data-testid="sweep-settings"
              >
                <dt class="text-muted-color">{{ 'platform.media.schedule' | transloco }}</dt>
                <dd data-testid="sweep-schedule">
                  @if (clockOf(sweep.schedule); as clock) {
                    {{ 'platform.media.dailyAt' | transloco: { time: clock } }}
                  } @else {
                    <span class="font-mono">{{ sweep.schedule }}</span>
                  }
                </dd>
                <dt class="text-muted-color">{{ 'platform.media.minAge' | transloco }}</dt>
                <dd data-testid="sweep-min-age">
                  {{
                    'platform.media.ageBasis.' + sweep.ageBasis
                      | transloco: { days: sweep.minAgeDays }
                  }}
                </dd>
                <dt class="text-muted-color">{{ 'platform.media.maxPerRun' | transloco }}</dt>
                <dd class="tabular-nums" data-testid="sweep-max">{{ sweep.maxPerRun }}</dd>
                <dt class="text-muted-color">{{ 'platform.media.asks' | transloco }}</dt>
                <dd data-testid="sweep-owner">
                  {{ 'platform.media.owners.' + ownerOf(sweep.kind) | transloco }}
                </dd>
              </dl>

              @if (card.checkError; as error) {
                <p
                  role="alert"
                  class="flex flex-wrap items-center gap-2 rounded-md border border-red-300 px-3 py-2 text-sm dark:border-red-800"
                  data-testid="sweep-check-error"
                >
                  <i class="pi pi-exclamation-triangle text-red-500" aria-hidden="true"></i>
                  @if (error.code === 'SWEEP_RUNNING') {
                    {{ 'platform.media.running' | transloco }}
                  } @else {
                    {{ 'reasonDialog.errors.' + error.key | transloco }}
                  }
                  @if (error.code) {
                    <span class="text-muted-color font-mono text-xs">{{ error.code }}</span>
                  }
                </p>
              }

              @if (card.deleted; as d) {
                <p
                  role="status"
                  class="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm dark:border-emerald-800 dark:bg-emerald-950"
                  data-testid="sweep-deleted"
                >
                  {{ 'platform.media.deletedResult' | transloco: { deleted: d.deleted } }}
                  @if (d.aborted) {
                    ·
                    {{
                      'platform.media.aborted'
                        | transloco
                          : {
                              service: ('platform.media.owners.' + ownerOf(sweep.kind) | transloco),
                            }
                    }}
                  }
                </p>
              } @else if (card.dryRun; as dry) {
                <div
                  role="status"
                  class="border-border flex flex-col gap-1 rounded-md border px-3 py-2 text-sm"
                  data-testid="sweep-dry-run"
                >
                  <span>
                    {{ 'platform.media.checkedAt' | transloco: { when: momentOf(dry.at) } }}
                    {{
                      'platform.media.dryRunResult'
                        | transloco
                          : {
                              scanned: dry.summary.scanned,
                              kept: dry.summary.kept,
                              candidates: dry.summary.candidates,
                            }
                    }}
                  </span>
                  @if (dry.summary.aborted) {
                    <span
                      class="text-amber-700 dark:text-amber-400"
                      data-testid="sweep-dry-run-aborted"
                      >{{
                        'platform.media.aborted'
                          | transloco
                            : {
                                service:
                                  ('platform.media.owners.' + ownerOf(sweep.kind) | transloco),
                              }
                      }}</span
                    >
                  }
                  @if (card.deleteBlocker; as blocker) {
                    <span
                      *appIfLevel="'super'"
                      class="text-muted-color text-xs"
                      data-testid="sweep-delete-blocked"
                    >
                      {{ 'platform.media.blocked.' + blocker | transloco }}
                    </span>
                  }
                </div>
              } @else {
                <p
                  *appIfLevel="'super'"
                  class="text-muted-color text-xs"
                  data-testid="sweep-delete-blocked"
                >
                  {{ 'platform.media.blocked.noDryRun' | transloco }}
                </p>
              }

              @if (sweep.recentRuns.length === 0) {
                <p class="text-muted-color text-sm" data-testid="sweep-no-runs">
                  {{ 'platform.media.noRuns' | transloco }}
                </p>
              } @else {
                <div class="border-border overflow-x-auto rounded-md border">
                  <table class="w-full min-w-[40rem] text-xs" data-testid="sweep-runs">
                    <caption class="sr-only">
                      {{
                        'platform.media.runsCaption' | transloco
                      }}
                    </caption>
                    <thead>
                      <tr class="border-border text-muted-color border-b text-left">
                        <th scope="col" class="px-3 py-2 font-medium">
                          {{ 'platform.media.runs.started' | transloco }}
                        </th>
                        <th scope="col" class="px-3 py-2 font-medium">
                          {{ 'platform.media.runs.trigger' | transloco }}
                        </th>
                        <th scope="col" class="px-3 py-2 text-right font-medium">
                          {{ 'platform.media.summary.scanned' | transloco }}
                        </th>
                        <th scope="col" class="px-3 py-2 text-right font-medium">
                          {{ 'platform.media.summary.kept' | transloco }}
                        </th>
                        <th scope="col" class="px-3 py-2 text-right font-medium">
                          {{ 'platform.media.summary.candidates' | transloco }}
                        </th>
                        <th scope="col" class="px-3 py-2 text-right font-medium">
                          {{ 'platform.media.summary.deleted' | transloco }}
                        </th>
                        <th scope="col" class="px-3 py-2 font-medium">
                          {{ 'platform.media.runs.outcome' | transloco }}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (run of sweep.recentRuns; track run.id) {
                        @let outcome = outcomeOf(run);
                        <tr
                          class="border-border border-b last:border-b-0"
                          data-testid="sweep-run"
                          [attr.data-outcome]="outcome"
                        >
                          <td class="px-3 py-2 whitespace-nowrap">{{ momentOf(run.startedAt) }}</td>
                          <td class="px-3 py-2">
                            {{ 'platform.media.triggers.' + run.trigger | transloco }}
                            <span class="text-muted-color">
                              · {{ 'platform.media.modes.' + run.mode | transloco }}
                            </span>
                          </td>
                          <td class="px-3 py-2 text-right tabular-nums">
                            {{ run.summary?.scanned ?? '—' }}
                          </td>
                          <td class="px-3 py-2 text-right tabular-nums">
                            {{ run.summary?.kept ?? '—' }}
                          </td>
                          <td class="px-3 py-2 text-right tabular-nums">
                            {{ run.summary?.candidates ?? '—' }}
                          </td>
                          <td class="px-3 py-2 text-right tabular-nums" data-testid="run-deleted">
                            {{ run.mode === 'delete' ? (run.summary?.deleted ?? '—') : '—' }}
                          </td>
                          <td class="px-3 py-2" data-testid="run-outcome">
                            <p-tag
                              [severity]="severities[outcome]"
                              [value]="
                                outcome === 'aborted'
                                  ? ('platform.media.aborted'
                                    | transloco
                                      : {
                                          service:
                                            ('platform.media.owners.' + ownerOf(sweep.kind)
                                            | transloco),
                                        })
                                  : ('platform.media.outcomes.' + outcome | transloco)
                              "
                            />
                            @if (run.error) {
                              <span
                                class="text-muted-color mt-1 block break-words"
                                data-testid="run-error"
                              >
                                {{ run.error }}
                              </span>
                            }
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              }
            </article>
          }
        }
      }

      <app-sweep-delete-dialog [(visible)]="dialogOpen" [dryRun]="target()" />
    </section>
  `,
})
export class MediaSweepsPage {
  protected readonly data = inject(MediaSweepsData);
  private readonly lang = inject(LanguageService).current;

  protected readonly severities = OUTCOME_SEVERITY;
  protected readonly dialogOpen = signal(false);
  protected readonly target = signal<DryRunResult | null>(null);

  private readonly overview = computed(() => {
    const state = this.data.state();
    return state.kind === 'ready' ? state.value : null;
  });

  /** One env setting for all four sweeps; the first item carries it. */
  protected readonly nightlyMode = computed(() => this.overview()?.items[0]?.nightlyMode ?? null);
  protected readonly historyDays = computed(() => this.overview()?.historyDays ?? 0);

  protected clockOf(cron: string): string | null {
    const time = dailyTime(cron);
    return time ? formatClock(time) : null;
  }

  protected momentOf(value: string | number): string {
    return formatMoment(new Date(value).toISOString(), this.lang());
  }

  protected outcomeOf(run: SweepRunDto): RunOutcome {
    return runOutcome(run);
  }

  /** The service a sweep asks whether a file is in use (named when it did not answer). */
  protected ownerOf(kind: SweepKind): string {
    return SWEEP_OWNER[kind] ?? 'none';
  }

  protected openDelete(dryRun: DryRunResult): void {
    this.target.set(dryRun);
    this.dialogOpen.set(true);
  }
}
