import { Injectable, computed, inject, linkedSignal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { TokenLifetimes, TokenLifetimesApi } from '../../../core/auth/token-lifetimes.api';
import { ColumnState } from '../../schools/schools-list.data';
import { stateOf } from '../../schools/card/plan/school-plan.data';
import { LifetimeRow, lifetimeRows } from './token-lifetime-rows';

/**
 * Data of "Platform → Session lifetimes": one read of auth. A saved change answers with every
 * lifetime as it now stands, which replaces the read without asking again.
 */
@Injectable()
export class TokenLifetimesData {
  private readonly api = inject(TokenLifetimesApi);

  private readonly resource = rxResource({ stream: () => this.api.list() });

  /** The read, or the answer of the last save. */
  private readonly current = linkedSignal<ColumnState<TokenLifetimes>>(() =>
    stateOf(this.resource),
  );

  readonly state = this.current.asReadonly();

  readonly rows = computed<LifetimeRow[]>(() => {
    const state = this.current();
    return state.kind === 'ready' ? lifetimeRows(state.value) : [];
  });

  /** A save went through: its answer is the new state. */
  saved(value: TokenLifetimes): void {
    this.current.set({ kind: 'ready', value });
  }

  reload(): void {
    this.resource.reload();
  }
}
