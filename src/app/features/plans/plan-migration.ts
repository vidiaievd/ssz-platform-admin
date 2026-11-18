import { DecimalPipe } from '@angular/common';
import {
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { ButtonDirective } from 'primeng/button';
import { Subscription } from 'rxjs';
import { MigrationPreviewDto } from '../../api/subscription/models/migration-preview-dto';
import { ActionError, describeActionError } from '../../shared/reason-dialog/action-error';
import { ReasonDialog } from '../../shared/reason-dialog/reason-dialog';
import { PlanChanges } from './plan-changes';
import { FeatureChange, changesOfDto, seatsShrink } from './plan-model';
import { MigrationPhase, PlanMigrations, migrationPercent } from './plan-migrations';

/** One source version of the preview, its changes in the panel's shape. */
interface PreviewSource {
  readonly version: number;
  readonly subscribers: number;
  readonly changes: readonly FeatureChange[];
  readonly fewerSeats: boolean;
}

type PreviewState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly error: ActionError }
  | { readonly kind: 'ready'; readonly total: number; readonly sources: readonly PreviewSource[] };

/**
 * "Move subscribers" on the plan card (plan 90, phase 8, step 15), `super` only, on an active
 * plan with subscribers below its current version. A preview first (subscription's dry run: how
 * many on each older version and what changes for them, key by key), then a run with a reason;
 * the run goes in batches of 200 with its progress shown, and a stopped, stuck or failed run is
 * continued from here — also after leaving the card and coming back (`PlanMigrations`).
 */
@Component({
  selector: 'app-plan-migration',
  imports: [DecimalPipe, TranslocoPipe, ButtonDirective, ReasonDialog, PlanChanges],
  template: `
    <section
      class="border-border flex flex-col gap-3 rounded-md border p-4"
      data-testid="plan-migration"
      [attr.data-phase]="run()?.phase ?? null"
    >
      <h2 class="text-base font-semibold">
        {{ 'plans.migration.title' | transloco: { version: toVersion() } }}
      </h2>

      @if (run(); as r) {
        <!-- A run of this panel: going on, stopped, stuck, failed or done -->
        <div class="flex flex-col gap-2" data-testid="migration-run">
          <div
            class="bg-surface-200 dark:bg-surface-700 h-2 w-full overflow-hidden rounded"
            role="progressbar"
            aria-valuemin="0"
            aria-valuemax="100"
            [attr.aria-valuenow]="percent()"
            [attr.aria-label]="'plans.migration.progress' | transloco"
            data-testid="migration-progress"
          >
            <div class="bg-primary h-full" [style.width.%]="percent()"></div>
          </div>
          <p class="text-sm tabular-nums" data-testid="migration-counts">
            {{
              'plans.migration.counts'
                | transloco: { moved: (r.moved | number), all: (r.moved + r.remaining | number) }
            }}
          </p>
          <p class="text-sm" data-testid="migration-phase">
            @switch (r.phase) {
              @case ('running') {
                <i class="pi pi-spin pi-spinner" aria-hidden="true"></i>
                {{
                  (r.stopping ? 'plans.migration.stopping' : 'plans.migration.running') | transloco
                }}
              }
              @case ('done') {
                <i class="pi pi-check text-green-600" aria-hidden="true"></i>
                {{ 'plans.migration.done' | transloco: { n: (r.moved | number) } }}
              }
              @case ('paused') {
                {{ 'plans.migration.paused' | transloco: { n: (r.remaining | number) } }}
              }
              @case ('stalled') {
                {{ 'plans.migration.stalled' | transloco: { n: (r.remaining | number) } }}
              }
              @case ('failed') {
                <span role="alert" class="flex flex-col gap-1">
                  <span>
                    <i class="pi pi-exclamation-triangle text-red-500" aria-hidden="true"></i>
                    {{ 'plans.migration.failed' | transloco: { n: (r.remaining | number) } }}
                    {{ 'reasonDialog.errors.' + r.error?.key | transloco }}
                  </span>
                  @if (r.error?.code) {
                    <span
                      class="text-muted-color font-mono text-xs"
                      data-testid="migration-error-code"
                    >
                      {{ r.error?.code }}
                    </span>
                  }
                </span>
              }
            }
          </p>
          <p class="text-muted-color text-xs">
            {{ 'plans.migration.reasonOfRun' | transloco }}: {{ r.reason }}
          </p>
          <div class="flex flex-wrap gap-2">
            @if (r.phase === 'running') {
              <button
                type="button"
                pButton
                size="small"
                severity="secondary"
                data-testid="migration-stop"
                [disabled]="r.stopping"
                (click)="migrations.stop(code())"
              >
                <i class="pi pi-pause" aria-hidden="true"></i>
                {{ 'plans.migration.stop' | transloco }}
              </button>
            } @else if (r.phase === 'done') {
              <button
                type="button"
                pButton
                size="small"
                severity="secondary"
                data-testid="migration-close"
                (click)="close()"
              >
                {{ 'plans.migration.close' | transloco }}
              </button>
            } @else {
              <button
                type="button"
                pButton
                size="small"
                data-testid="migration-resume"
                (click)="migrations.resume(code())"
              >
                <i class="pi pi-play" aria-hidden="true"></i>
                {{ 'plans.migration.resume' | transloco }}
              </button>
              <button
                type="button"
                pButton
                size="small"
                severity="secondary"
                [text]="true"
                data-testid="migration-leave"
                (click)="close()"
              >
                {{ 'plans.migration.leave' | transloco }}
              </button>
            }
          </div>
        </div>
      } @else {
        @switch (preview().kind) {
          @case ('idle') {
            <p class="text-muted-color text-sm">{{ 'plans.migration.intro' | transloco }}</p>
            <button
              type="button"
              pButton
              size="small"
              class="w-fit"
              data-testid="migration-preview"
              (click)="loadPreview()"
            >
              <i class="pi pi-eye" aria-hidden="true"></i>
              {{ 'plans.migration.preview' | transloco }}
            </button>
          }
          @case ('loading') {
            <p class="text-sm" data-testid="migration-preview-loading">
              <i class="pi pi-spin pi-spinner" aria-hidden="true"></i>
              {{ 'plans.migration.previewLoading' | transloco }}
            </p>
          }
          @case ('error') {
            @let e = previewError();
            <p class="text-sm" role="alert" data-testid="migration-preview-failed">
              {{ 'plans.migration.previewFailed' | transloco }}
              {{ 'reasonDialog.errors.' + e?.key | transloco }}
              @if (e?.code) {
                <span class="text-muted-color font-mono text-xs">{{ e?.code }}</span>
              }
              ·
              <button type="button" class="text-primary underline" (click)="loadPreview()">
                {{ 'schools.retry' | transloco }}
              </button>
            </p>
          }
          @case ('ready') {
            @let p = ready();
            @if (p && p.total === 0) {
              <p class="text-sm" data-testid="migration-nobody">
                {{ 'plans.migration.nobody' | transloco }}
              </p>
            } @else if (p) {
              <p class="text-sm" data-testid="migration-total">
                {{
                  'plans.migration.total'
                    | transloco: { n: (p.total | number), version: toVersion() }
                }}
              </p>
              <ul class="flex flex-col gap-3">
                @for (s of p.sources; track s.version) {
                  <li
                    class="flex flex-col gap-1"
                    data-testid="migration-source"
                    [attr.data-version]="s.version"
                  >
                    <h3 class="text-sm font-medium">
                      {{
                        'plans.migration.source'
                          | transloco: { version: s.version, n: (s.subscribers | number) }
                      }}
                    </h3>
                    @if (s.changes.length === 0) {
                      <p class="text-muted-color text-sm" data-testid="migration-same">
                        {{ 'plans.migration.same' | transloco }}
                      </p>
                    } @else {
                      <app-plan-changes [changes]="s.changes" />
                    }
                    @if (s.fewerSeats) {
                      <p
                        class="text-sm text-amber-700 dark:text-amber-400"
                        data-testid="migration-fewer-seats"
                      >
                        {{ 'plans.migration.fewerSeats' | transloco }}
                      </p>
                    }
                  </li>
                }
              </ul>
              <p class="text-muted-color text-xs">{{ 'plans.migration.keeps' | transloco }}</p>
              <div class="flex flex-wrap gap-2">
                <button
                  type="button"
                  pButton
                  size="small"
                  data-testid="migration-start"
                  (click)="confirmOpen.set(true)"
                >
                  <i class="pi pi-arrow-up" aria-hidden="true"></i>
                  {{ 'plans.migration.start' | transloco: { n: (p.total | number) } }}
                </button>
                <button
                  type="button"
                  pButton
                  size="small"
                  severity="secondary"
                  [text]="true"
                  data-testid="migration-preview-again"
                  (click)="loadPreview()"
                >
                  <i class="pi pi-refresh" aria-hidden="true"></i>
                  {{ 'plans.migration.previewAgain' | transloco }}
                </button>
              </div>

              <app-reason-dialog
                [(visible)]="confirmOpen"
                [header]="'plans.migration.dialog.title' | transloco"
                [confirmLabel]="'plans.migration.dialog.confirm' | transloco"
                level="super"
                [action]="start"
              >
                <p class="text-sm" data-testid="migration-dialog-text">
                  {{
                    'plans.migration.dialog.text'
                      | transloco: { n: (p.total | number), version: toVersion() }
                  }}
                </p>
                <p class="text-muted-color text-xs">
                  {{ 'plans.migration.dialog.batches' | transloco }}
                </p>
              </app-reason-dialog>
            }
          }
        }
      }
    </section>
  `,
})
export class PlanMigration {
  readonly code = input.required<string>();
  /** The plan's current version — the only one subscribers may be moved to. */
  readonly toVersion = input.required<number>();
  /** A call of a run answered or the run ended: the card's counts are stale. */
  readonly moved = output<void>();

  protected readonly migrations = inject(PlanMigrations);
  private readonly started = this.migrations.of(() => this.code());

  /** The panel's run for this plan, unless it targets a version that is no longer current. */
  protected readonly run = computed(() => {
    const run = this.started();
    return run && run.toVersion === this.toVersion() ? run : null;
  });
  protected readonly percent = computed(() => {
    const run = this.run();
    return run ? migrationPercent(run) : 0;
  });

  protected readonly preview = signal<PreviewState>({ kind: 'idle' });
  protected readonly ready = computed(() => {
    const p = this.preview();
    return p.kind === 'ready' ? p : null;
  });
  protected readonly previewError = computed(() => {
    const p = this.preview();
    return p.kind === 'error' ? p.error : null;
  });
  protected readonly confirmOpen = signal(false);

  private loading: Subscription | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.loading?.unsubscribe());

    // A run left on a version that is no longer current cannot go on (subscription answers 422).
    effect(() => {
      const run = this.started();
      if (run && run.phase !== 'running' && run.toVersion !== this.toVersion()) {
        untracked(() => this.migrations.forget(run.code));
      }
    });

    // A run starting or ending (stopped, stuck, failed, done) changes the counts on the card; the
    // preview is used up by it. Calls in between only move the run's own progress.
    let first = true;
    let last: MigrationPhase | null = null;
    effect(() => {
      const phase = this.run()?.phase ?? null;
      if (phase !== last) {
        untracked(() => {
          if (phase !== null) this.preview.set({ kind: 'idle' });
          if (!first) this.moved.emit();
        });
      }
      first = false;
      last = phase;
    });
  }

  protected loadPreview(): void {
    this.loading?.unsubscribe();
    this.preview.set({ kind: 'loading' });
    this.loading = this.migrations.preview(this.code(), this.toVersion()).subscribe({
      next: (res: MigrationPreviewDto) =>
        this.preview.set({
          kind: 'ready',
          total: res.total,
          sources: res.sources.map((s) => {
            const changes = changesOfDto(s.changes);
            return {
              version: s.version,
              subscribers: s.subscribers,
              changes,
              fewerSeats: seatsShrink(changes),
            };
          }),
        }),
      error: (error: unknown) =>
        this.preview.set({ kind: 'error', error: describeActionError(error) }),
    });
  }

  protected readonly start = (reason: string) =>
    this.migrations.start(this.code(), this.toVersion(), reason);

  /** Done, or left where it stopped: the card goes back to the preview. */
  protected close(): void {
    this.migrations.forget(this.code());
    this.preview.set({ kind: 'idle' });
  }
}
