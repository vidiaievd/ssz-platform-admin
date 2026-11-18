import { SweepRunDto } from '../../../api/media/models/sweep-run-dto';
import { SweepRunSummaryDto } from '../../../api/media/models/sweep-run-summary-dto';
import {
  DRY_RUN_FRESH_MS,
  DryRunResult,
  dailyTime,
  deleteBlocker,
  runOutcome,
} from './sweep-model';

const SUMMARY: SweepRunSummaryDto = {
  scanned: 10,
  kept: 7,
  candidates: 3,
  deleted: 0,
  aborted: false,
  skipped: false,
};

function run(patch: Partial<SweepRunDto>): SweepRunDto {
  return {
    id: 'r1',
    kind: 'orphan_recordings',
    mode: 'dry-run',
    trigger: 'nightly',
    actorId: null,
    startedAt: '2026-11-15T03:30:00Z',
    finishedAt: '2026-11-15T03:31:00Z',
    error: null,
    report: {},
    summary: SUMMARY,
    ...patch,
  };
}

describe('runOutcome', () => {
  it('reads how a run ended', () => {
    expect(runOutcome(run({}))).toBe('done');
    expect(runOutcome(run({ finishedAt: null, summary: null, report: null }))).toBe('running');
    expect(runOutcome(run({ error: 'boom', summary: null }))).toBe('failed');
    expect(runOutcome(run({ summary: { ...SUMMARY, aborted: true } }))).toBe('aborted');
    expect(runOutcome(run({ summary: { ...SUMMARY, skipped: true } }))).toBe('skipped');
  });

  it('puts an error above a missing end', () => {
    expect(runOutcome(run({ error: 'boom', finishedAt: null }))).toBe('failed');
  });
});

describe('dailyTime', () => {
  it('reads a daily cron', () => {
    expect(dailyTime('30 3 * * *')).toEqual({ hour: 3, minute: 30 });
    expect(dailyTime('5 23 * * *')).toEqual({ hour: 23, minute: 5 });
  });

  it('leaves any other cron as it is', () => {
    expect(dailyTime('*/5 * * * *')).toBeNull();
    expect(dailyTime('30 3 * * 1')).toBeNull();
    expect(dailyTime('61 3 * * *')).toBeNull();
  });
});

describe('deleteBlocker', () => {
  const now = Date.parse('2026-11-15T10:00:00Z');
  const dry = (patch: Partial<SweepRunSummaryDto> = {}, age = 60_000): DryRunResult => ({
    kind: 'orphan_recordings',
    summary: { ...SUMMARY, ...patch },
    runId: 'r1',
    at: now - age,
  });

  it('offers delete on a fresh dry run with something to delete', () => {
    expect(deleteBlocker(dry(), now)).toBeNull();
    expect(deleteBlocker(dry({}, DRY_RUN_FRESH_MS), now)).toBeNull();
  });

  it('asks for a dry run when there is none or it is old', () => {
    expect(deleteBlocker(null, now)).toBe('noDryRun');
    expect(deleteBlocker(dry({}, DRY_RUN_FRESH_MS + 1), now)).toBe('noDryRun');
  });

  it('does not offer delete on an unfinished or empty check', () => {
    expect(deleteBlocker(dry({ aborted: true }), now)).toBe('aborted');
    expect(deleteBlocker(dry({ skipped: true }), now)).toBe('aborted');
    expect(deleteBlocker(dry({ candidates: 0 }), now)).toBe('nothing');
  });
});
