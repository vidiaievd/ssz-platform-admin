import { Injectable, Signal, computed, inject, signal } from '@angular/core';
import { Observable, map, tap } from 'rxjs';
import { adminPlanMigrationMigrate } from '../../api/subscription/functions';
import { MigrationBatchDto } from '../../api/subscription/models/migration-batch-dto';
import { MigrationPreviewDto } from '../../api/subscription/models/migration-preview-dto';
import { SubscriptionApi } from '../../api/subscription/subscription-api';
import { ActionError, describeActionError } from '../../shared/reason-dialog/action-error';

/**
 * Where a run stands: calls going on; stopped by the administrator; stuck (a call moved nobody
 * while some remain — subscription says stop); a call failed; everybody moved.
 */
export type MigrationPhase = 'running' | 'paused' | 'stalled' | 'failed' | 'done';

/** One run of moving a plan's subscribers onto its current version. */
export interface MigrationRun {
  readonly code: string;
  readonly toVersion: number;
  /** Shared by every call of the run, so the journal rows of the run share it. */
  readonly batchId: string;
  readonly reason: string;
  readonly phase: MigrationPhase;
  /** Accounts moved by this run so far, over every call. */
  readonly moved: number;
  /** Still to move after the last call. */
  readonly remaining: number;
  /** A stop was asked for; it takes effect when the call in flight answers. */
  readonly stopping: boolean;
  readonly error: ActionError | null;
}

/** Share of the run done, 0–100; a run with nothing left is complete. */
export function migrationPercent(run: Pick<MigrationRun, 'moved' | 'remaining'>): number {
  const all = run.moved + run.remaining;
  return all === 0 ? 100 : Math.floor((run.moved / all) * 100);
}

/**
 * Runs of `POST admin/subscriptions/plans/:code/migrate` (plan 90, phase 8, step 15). subscription
 * moves at most 200 accounts per call, so a run is a chain of calls with the same `batchId`, made
 * here until nobody remains. Root-provided: leaving the plan card does not stop a run, and coming
 * back shows it; a stopped, stuck or failed run is continued with the same `batchId` and reason. A
 * reload of the page forgets it — what is left is then seen on the card as subscribers on older
 * versions, and a new run (new preview, new reason) moves them.
 */
@Injectable({ providedIn: 'root' })
export class PlanMigrations {
  private readonly api = inject(SubscriptionApi);
  private readonly runs = signal<Readonly<Record<string, MigrationRun>>>({});

  /** The run of a plan, if this panel started one. */
  of(code: () => string): Signal<MigrationRun | null> {
    return computed(() => this.runs()[code()] ?? null);
  }

  /** Dry run: who would move and what changes for them; nothing is written. */
  preview(code: string, toVersion: number): Observable<MigrationPreviewDto> {
    return this.api
      .invoke(adminPlanMigrationMigrate, { code, body: { toVersion, dryRun: true } })
      .pipe(map((res) => res as MigrationPreviewDto));
  }

  /**
   * The first call of a new run. Its refusal goes to the caller (the reason dialog shows it);
   * once it answers, the run is recorded and goes on by itself.
   */
  start(code: string, toVersion: number, reason: string): Observable<MigrationBatchDto> {
    return this.batch(code, { toVersion, reason }).pipe(
      tap((batch) => {
        this.set({
          code,
          toVersion,
          batchId: batch.batchId,
          reason,
          phase: 'running',
          moved: batch.moved,
          remaining: batch.remaining,
          stopping: false,
          error: null,
        });
        this.after(code, batch);
      }),
    );
  }

  /** Goes on with a stopped, stuck or failed run: same `batchId`, same reason. */
  resume(code: string): void {
    const run = this.runs()[code];
    if (!run || run.phase === 'running' || run.phase === 'done') return;
    this.patch(code, { phase: 'running', stopping: false, error: null });
    this.next(code);
  }

  /** Stops after the call in flight. */
  stop(code: string): void {
    const run = this.runs()[code];
    if (run?.phase === 'running') this.patch(code, { stopping: true });
  }

  /** Drops a run that is not going on (done, or left as it is). */
  forget(code: string): void {
    if (this.runs()[code]?.phase === 'running') return;
    this.runs.update((runs) => {
      const rest = { ...runs };
      delete rest[code];
      return rest;
    });
  }

  private next(code: string): void {
    const run = this.runs()[code];
    if (!run) return;
    this.batch(code, {
      toVersion: run.toVersion,
      reason: run.reason,
      batchId: run.batchId,
    }).subscribe({
      next: (batch) => {
        const current = this.runs()[code];
        if (!current) return;
        this.patch(code, { moved: current.moved + batch.moved, remaining: batch.remaining });
        this.after(code, batch);
      },
      error: (error: unknown) =>
        this.patch(code, { phase: 'failed', stopping: false, error: describeActionError(error) }),
    });
  }

  /** What the run does after a call answered. */
  private after(code: string, batch: MigrationBatchDto): void {
    const run = this.runs()[code];
    if (!run) return;
    if (batch.remaining === 0) {
      this.patch(code, { phase: 'done', stopping: false });
    } else if (batch.moved === 0) {
      // Everybody picked changed meanwhile: subscription asks the caller to stop here.
      this.patch(code, { phase: 'stalled', stopping: false });
    } else if (run.stopping) {
      this.patch(code, { phase: 'paused', stopping: false });
    } else {
      this.next(code);
    }
  }

  private batch(
    code: string,
    body: { toVersion: number; reason: string; batchId?: string },
  ): Observable<MigrationBatchDto> {
    return this.api
      .invoke(adminPlanMigrationMigrate, { code, body: { ...body, dryRun: false } })
      .pipe(map((res) => res as MigrationBatchDto));
  }

  private set(run: MigrationRun): void {
    this.runs.update((runs) => ({ ...runs, [run.code]: run }));
  }

  private patch(code: string, changes: Partial<MigrationRun>): void {
    const run = this.runs()[code];
    if (run) this.set({ ...run, ...changes });
  }
}
