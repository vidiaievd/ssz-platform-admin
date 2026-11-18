import { SweepKindOverviewDto } from '../../../api/media/models/sweep-kind-overview-dto';
import { SweepRunDto } from '../../../api/media/models/sweep-run-dto';
import { SweepRunSummaryDto } from '../../../api/media/models/sweep-run-summary-dto';

export type SweepKind = SweepKindOverviewDto['kind'];

/**
 * The service a sweep asks whether a file is still in use; when it does not answer the run
 * stops (`aborted`). Abandoned uploads ask nobody — an upload never confirmed is unused.
 */
export const SWEEP_OWNER: Readonly<Record<SweepKind, 'engine' | 'content' | null>> = {
  orphan_recordings: 'engine',
  superseded_narrations: 'content',
  abandoned_uploads: null,
  orphan_content: 'content',
};

/**
 * How a run ended, for its row: `running` — no end written (still going, or the process died
 * before it could write it); `failed` — the sweep threw; `aborted` — the owner of the references
 * did not answer; `skipped` — another run of the kind was going.
 */
export type RunOutcome = 'running' | 'failed' | 'aborted' | 'skipped' | 'done';

export function runOutcome(run: SweepRunDto): RunOutcome {
  if (run.error) return 'failed';
  if (!run.finishedAt) return 'running';
  if (run.summary?.skipped) return 'skipped';
  if (run.summary?.aborted) return 'aborted';
  return 'done';
}

/** `m h * * *` → `{ hour, minute }`; any other cron is shown as it is. */
export function dailyTime(cron: string): { hour: number; minute: number } | null {
  const match = /^(\d{1,2}) (\d{1,2}) \* \* \*$/.exec(cron.trim());
  if (!match) return null;
  const minute = Number(match[1]);
  const hour = Number(match[2]);
  if (minute > 59 || hour > 23) return null;
  return { hour, minute };
}

export function formatClock({ hour, minute }: { hour: number; minute: number }): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/** How long a dry run counts as fresh enough to delete by: what it counted may have moved since. */
export const DRY_RUN_FRESH_MS = 30 * 60_000;

/** A dry run started from this panel, kept to open "Delete" with its numbers. */
export interface DryRunResult {
  readonly kind: SweepKind;
  readonly summary: SweepRunSummaryDto;
  readonly runId: string | null;
  /** When the answer came, epoch ms. */
  readonly at: number;
}

/**
 * Why "Delete" is not offered after this dry run, or null when it is: none yet (or too old),
 * the run stopped before it saw everything, or it found nothing to delete.
 */
export function deleteBlocker(
  dryRun: DryRunResult | null,
  now: number,
): 'noDryRun' | 'aborted' | 'nothing' | null {
  if (!dryRun || now - dryRun.at > DRY_RUN_FRESH_MS) return 'noDryRun';
  if (dryRun.summary.aborted || dryRun.summary.skipped) return 'aborted';
  if (dryRun.summary.candidates === 0) return 'nothing';
  return null;
}
