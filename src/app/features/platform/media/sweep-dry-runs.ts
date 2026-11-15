import { Injectable, signal } from '@angular/core';
import { DryRunResult, SweepKind } from './sweep-model';

/**
 * The last dry run of each sweep started from this panel, for as long as the panel is open:
 * switching tabs keeps them, a reload of the page forgets them. "Delete" is offered only on a
 * fresh one, and a delete uses it up — the next delete needs a new count.
 */
@Injectable({ providedIn: 'root' })
export class SweepDryRuns {
  private readonly byKind = signal<Partial<Record<SweepKind, DryRunResult>>>({});

  readonly all = this.byKind.asReadonly();

  record(result: DryRunResult): void {
    this.byKind.update((runs) => ({ ...runs, [result.kind]: result }));
  }

  forget(kind: SweepKind): void {
    this.byKind.update((runs) => {
      const next = { ...runs };
      delete next[kind];
      return next;
    });
  }
}
