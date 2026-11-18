import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Observable, Subscription, tap } from 'rxjs';
import { MediaApi } from '../../../api/media/media-api';
import { adminSweepsOverview, adminSweepsRun } from '../../../api/media/functions';
import { RunSweepResponseDto } from '../../../api/media/models/run-sweep-response-dto';
import { SweepKindOverviewDto } from '../../../api/media/models/sweep-kind-overview-dto';
import { SweepRunSummaryDto } from '../../../api/media/models/sweep-run-summary-dto';
import { SweepsOverviewDto } from '../../../api/media/models/sweeps-overview-dto';
import { ActionError, describeActionError } from '../../../shared/reason-dialog/action-error';
import { ColumnState } from '../../schools/schools-list.data';
import { stateOf } from '../../schools/card/plan/school-plan.data';
import { SweepDryRuns } from './sweep-dry-runs';
import { DryRunResult, SweepKind, deleteBlocker } from './sweep-model';

export interface SweepCard {
  readonly sweep: SweepKindOverviewDto;
  /** The last dry run started here, fresh or not. */
  readonly dryRun: DryRunResult | null;
  readonly deleteBlocker: ReturnType<typeof deleteBlocker>;
  readonly checking: boolean;
  readonly checkError: ActionError | null;
  /** The answer of the last delete from here; cleared by the next dry run. */
  readonly deleted: SweepRunSummaryDto | null;
}

/** How often the freshness of the dry runs is looked at again. */
const CLOCK_TICK_MS = 30_000;

/**
 * Data of "Platform → Media cleanup": media's `GET admin/media/sweeps` (schedule, nightly mode,
 * last runs of the four sweeps) and the runs started here. A run is synchronous — the answer is
 * the report; the overview is read again after it, so the new `sweep_runs` row shows in the
 * history. A dry run is kept in `SweepDryRuns`: "Delete" opens only on a fresh one.
 */
@Injectable()
export class MediaSweepsData {
  private readonly media = inject(MediaApi);
  private readonly dryRuns = inject(SweepDryRuns);

  private readonly resource = rxResource({ stream: () => this.media.invoke(adminSweepsOverview) });

  readonly state = computed<ColumnState<SweepsOverviewDto>>(() => stateOf(this.resource));

  /** The time freshness is judged by; moves on a timer, so an old dry run stops offering "Delete". */
  private readonly now = signal(Date.now());

  /** Kinds with a dry run on its way. */
  private readonly checking = signal<ReadonlySet<SweepKind>>(new Set());
  private readonly checkErrors = signal<Partial<Record<SweepKind, ActionError>>>({});
  private readonly deleted = signal<Partial<Record<SweepKind, SweepRunSummaryDto>>>({});
  private readonly running = new Map<SweepKind, Subscription>();

  /** One card per sweep, in the server's order, with what was done to it from here. */
  readonly cards = computed<SweepCard[]>(() => {
    const state = this.state();
    if (state.kind !== 'ready') return [];
    const dryRuns = this.dryRuns.all();
    return state.value.items.map((sweep) => {
      const dryRun = dryRuns[sweep.kind] ?? null;
      return {
        sweep,
        dryRun,
        deleteBlocker: deleteBlocker(dryRun, this.now()),
        checking: this.checking().has(sweep.kind),
        checkError: this.checkErrors()[sweep.kind] ?? null,
        deleted: this.deleted()[sweep.kind] ?? null,
      };
    });
  });

  constructor() {
    const timer = setInterval(() => this.now.set(Date.now()), CLOCK_TICK_MS);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(timer);
      for (const sub of this.running.values()) sub.unsubscribe();
    });
  }

  reload(): void {
    this.resource.reload();
  }

  /** "Check now": a dry run, level `admin`, nothing journalled. */
  check(kind: SweepKind): void {
    if (this.checking().has(kind)) return;
    this.checking.update((set) => new Set(set).add(kind));
    this.checkErrors.update((errors) => ({ ...errors, [kind]: undefined }));
    this.deleted.update((results) => ({ ...results, [kind]: undefined }));

    const done = () => {
      this.running.delete(kind);
      this.checking.update((set) => {
        const next = new Set(set);
        next.delete(kind);
        return next;
      });
    };
    this.running.set(
      kind,
      this.media.invoke(adminSweepsRun, { kind, body: { dryRun: true } }).subscribe({
        next: (answer) => {
          done();
          this.dryRuns.record({
            kind,
            summary: answer.summary,
            runId: answer.runId,
            at: Date.now(),
          });
          this.now.set(Date.now());
          this.reload();
        },
        error: (error: unknown) => {
          done();
          this.checkErrors.update((errors) => ({ ...errors, [kind]: describeActionError(error) }));
        },
      }),
    );
  }

  /** "Delete": level `super`, with a reason; it uses up the dry run it was opened on. */
  delete(kind: SweepKind, reason: string): Observable<RunSweepResponseDto> {
    return this.media.invoke(adminSweepsRun, { kind, body: { dryRun: false, reason } }).pipe(
      tap((answer) => {
        this.dryRuns.forget(kind);
        this.deleted.update((results) => ({ ...results, [kind]: answer.summary }));
        this.reload();
      }),
    );
  }
}
