import { InjectionToken } from '@angular/core';
import {
  Observable,
  catchError,
  concat,
  distinctUntilChanged,
  map,
  of,
  switchMap,
  timer,
} from 'rxjs';
import { ApiError } from '../../core/auth/api-error';
import { SCHOOL_SEARCH_MIN, SearchState } from './palette-options';

/** Pause after the last key before the palette asks the server; specs set it to 0. */
export const PALETTE_SEARCH_DELAY_MS = new InjectionToken<number>('PALETTE_SEARCH_DELAY_MS', {
  providedIn: 'root',
  factory: () => 250,
});

/** One search request: the term and a retry counter (a retry repeats the same term). */
export interface SearchRequest {
  readonly term: string;
  readonly attempt: number;
}

/**
 * Terms → states of one search of the palette (schools, users). Every new term drops the previous one at once —
 * the pending pause and the request in flight (switchMap cancels the HTTP call) — and is
 * "loading" straight away, so Enter can never open a result found for an older term.
 */
export function searchPage<T>(
  requests: Observable<SearchRequest>,
  fetch: (term: string) => Observable<{ readonly items: readonly T[]; readonly total: number }>,
  delayMs: number,
): Observable<SearchState<T>> {
  return requests.pipe(
    distinctUntilChanged((a, b) => a.term === b.term && a.attempt === b.attempt),
    switchMap(({ term }) => {
      if (term.length < SCHOOL_SEARCH_MIN) return of<SearchState<T>>({ kind: 'idle' });
      return concat(
        of<SearchState<T>>({ kind: 'loading', term }),
        timer(delayMs).pipe(
          switchMap(() => fetch(term)),
          map((page): SearchState<T> => ({
            kind: 'ready',
            term,
            items: page.items,
            total: page.total,
          })),
          catchError((error: unknown) =>
            of<SearchState<T>>({ kind: 'error', term, error: ApiError.from(error) }),
          ),
        ),
      );
    }),
  );
}
