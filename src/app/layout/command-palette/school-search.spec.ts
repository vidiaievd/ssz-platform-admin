import { HttpErrorResponse } from '@angular/common/http';
import { Observable, Subject, throwError } from 'rxjs';
import { AdminSchoolPageDto } from '../../api/organization/models/admin-school-page-dto';
import { SchoolSearchState } from './palette-options';
import { SchoolSearchRequest, searchSchools } from './school-search';

const PAGE: AdminSchoolPageDto = { items: [], total: 0, page: 1, limit: 8 };

describe('searchSchools', () => {
  let requests: Subject<SchoolSearchRequest>;
  let calls: { term: string; subject: Subject<AdminSchoolPageDto>; cancelled: boolean }[];
  let states: SchoolSearchState[];

  function run(fetch?: (term: string) => Observable<AdminSchoolPageDto>) {
    requests = new Subject();
    calls = [];
    states = [];
    const defaultFetch = (term: string) =>
      new Observable<AdminSchoolPageDto>((subscriber) => {
        const call = { term, subject: new Subject<AdminSchoolPageDto>(), cancelled: false };
        calls.push(call);
        const sub = call.subject.subscribe(subscriber);
        return () => {
          call.cancelled = !call.subject.closed;
          sub.unsubscribe();
        };
      });
    searchSchools(requests, fetch ?? defaultFetch, 250).subscribe((s) => states.push(s));
  }

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('asks nothing for a term shorter than two characters', () => {
    run();
    requests.next({ term: 'n', attempt: 0 });
    vi.advanceTimersByTime(1000);
    expect(calls).toHaveLength(0);
    expect(states).toEqual([{ kind: 'idle' }]);
  });

  it('is loading at once and asks only after the pause', () => {
    run();
    requests.next({ term: 'no', attempt: 0 });
    expect(states.at(-1)).toEqual({ kind: 'loading', term: 'no' });
    vi.advanceTimersByTime(249);
    expect(calls).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(calls.map((c) => c.term)).toEqual(['no']);

    calls[0].subject.next({ ...PAGE, total: 3 });
    expect(states.at(-1)).toEqual({ kind: 'ready', term: 'no', items: [], total: 3 });
  });

  it('drops the pending pause when typing goes on', () => {
    run();
    requests.next({ term: 'no', attempt: 0 });
    vi.advanceTimersByTime(200);
    requests.next({ term: 'nor', attempt: 0 });
    vi.advanceTimersByTime(250);
    expect(calls.map((c) => c.term)).toEqual(['nor']);
  });

  it('cancels the request in flight for a new term', () => {
    run();
    requests.next({ term: 'no', attempt: 0 });
    vi.advanceTimersByTime(250);
    requests.next({ term: 'nord', attempt: 0 });
    expect(calls[0].cancelled).toBe(true);
    expect(states.at(-1)).toEqual({ kind: 'loading', term: 'nord' });
  });

  it('turns a failure into an error state and asks again on retry', () => {
    let fail = true;
    let asked = 0;
    run((term) => {
      asked++;
      return fail
        ? throwError(() => new HttpErrorResponse({ status: 0 }))
        : new Observable<AdminSchoolPageDto>((s) => s.next({ ...PAGE, total: term.length }));
    });
    requests.next({ term: 'no', attempt: 0 });
    vi.advanceTimersByTime(250);
    const failed = states.at(-1)!;
    expect(failed.kind).toBe('error');
    expect(failed.kind === 'error' && failed.error.isNetworkError).toBe(true);

    // The same term again is not a new search; a retry is.
    requests.next({ term: 'no', attempt: 0 });
    expect(asked).toBe(1);
    fail = false;
    requests.next({ term: 'no', attempt: 1 });
    vi.advanceTimersByTime(250);
    expect(asked).toBe(2);
    expect(states.at(-1)).toMatchObject({ kind: 'ready', total: 2 });
  });
});
