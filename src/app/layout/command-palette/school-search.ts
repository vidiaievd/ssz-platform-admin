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
import { AdminSchoolPageDto } from '../../api/organization/models/admin-school-page-dto';
import { ApiError } from '../../core/auth/api-error';
import { SCHOOL_SEARCH_MIN, SchoolSearchState } from './palette-options';

/** Pause after the last key before the palette asks the server; specs set it to 0. */
export const PALETTE_SEARCH_DELAY_MS = new InjectionToken<number>('PALETTE_SEARCH_DELAY_MS', {
  providedIn: 'root',
  factory: () => 250,
});

/** One search request: the term and a retry counter (a retry repeats the same term). */
export interface SchoolSearchRequest {
  readonly term: string;
  readonly attempt: number;
}

/**
 * Terms → states of the school search. Every new term drops the previous one at once —
 * the pending pause and the request in flight (switchMap cancels the HTTP call) — and is
 * "loading" straight away, so Enter can never open a school found for an older term.
 */
export function searchSchools(
  requests: Observable<SchoolSearchRequest>,
  fetch: (term: string) => Observable<AdminSchoolPageDto>,
  delayMs: number,
): Observable<SchoolSearchState> {
  return requests.pipe(
    distinctUntilChanged((a, b) => a.term === b.term && a.attempt === b.attempt),
    switchMap(({ term }) => {
      if (term.length < SCHOOL_SEARCH_MIN) return of<SchoolSearchState>({ kind: 'idle' });
      return concat(
        of<SchoolSearchState>({ kind: 'loading', term }),
        timer(delayMs).pipe(
          switchMap(() => fetch(term)),
          map((page): SchoolSearchState => ({
            kind: 'ready',
            term,
            items: page.items,
            total: page.total,
          })),
          catchError((error: unknown) =>
            of<SchoolSearchState>({ kind: 'error', term, error: ApiError.from(error) }),
          ),
        ),
      );
    }),
  );
}
