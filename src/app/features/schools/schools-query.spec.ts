import { convertToParamMap } from '@angular/router';
import {
  DEFAULT_SCHOOLS_QUERY,
  ariaSort,
  hasFilters,
  nextSort,
  parseSchoolsQuery,
  toListParams,
  toSchoolsQueryParams,
  withFilter,
} from './schools-query';

const parse = (params: Record<string, string>) => parseSchoolsQuery(convertToParamMap(params));

describe('schools query', () => {
  it('reads a full URL', () => {
    expect(
      parse({ q: ' oslo ', kind: 'SOLO', status: 'deleted', sort: 'name', page: '3', size: '50' }),
    ).toEqual({ search: 'oslo', kind: 'SOLO', status: 'deleted', sort: 'name', page: 3, size: 50 });
  });

  it('falls back to defaults on anything malformed', () => {
    expect(
      parse({ kind: 'school', status: 'suspended', sort: 'city', page: '0', size: '30' }),
    ).toEqual(DEFAULT_SCHOOLS_QUERY);
    expect(parse({ page: '-2' }).page).toBe(1);
    expect(parse({ page: '2.5' }).page).toBe(1);
    expect(parse({ page: '1e3' }).page).toBe(1);
    expect(parse({ q: 'x'.repeat(300) }).search).toHaveLength(100);
  });

  it('leaves defaults out of the URL, so /schools is the default screen', () => {
    expect(toSchoolsQueryParams(DEFAULT_SCHOOLS_QUERY)).toEqual({
      q: null,
      kind: null,
      status: null,
      sort: null,
      page: null,
      size: null,
    });
    const query = {
      search: 'bergen',
      kind: 'SCHOOL',
      status: 'active',
      sort: 'name',
      page: 2,
      size: 10,
    } as const;
    expect(toSchoolsQueryParams(query)).toEqual({
      q: 'bergen',
      kind: 'SCHOOL',
      status: 'active',
      sort: 'name',
      page: 2,
      size: 10,
    });
  });

  it('round-trips through the URL', () => {
    const query = {
      search: 'å',
      kind: null,
      status: 'inactive',
      sort: '-name',
      page: 4,
      size: 100,
    } as const;
    const params = Object.fromEntries(
      Object.entries(toSchoolsQueryParams(query))
        .filter(([, v]) => v !== null)
        .map(([k, v]) => [k, String(v)]),
    );
    expect(parse(params)).toEqual(query);
  });

  it('sends only what narrows the list to the server', () => {
    expect(toListParams(DEFAULT_SCHOOLS_QUERY)).toEqual({ sort: '-createdAt', page: 1, limit: 25 });
    expect(toListParams({ ...DEFAULT_SCHOOLS_QUERY, search: 'oslo', kind: 'SOLO' })).toEqual({
      search: 'oslo',
      kind: 'SOLO',
      sort: '-createdAt',
      page: 1,
      limit: 25,
    });
  });

  it('starts a filter change from page 1 and knows when the list is filtered', () => {
    const onPage3 = { ...DEFAULT_SCHOOLS_QUERY, page: 3 };
    expect(withFilter(onPage3, { status: 'active' })).toEqual({
      ...onPage3,
      status: 'active',
      page: 1,
    });
    expect(hasFilters(onPage3)).toBe(false);
    expect(hasFilters({ ...onPage3, sort: 'name', size: 50 })).toBe(false);
    expect(hasFilters({ ...onPage3, kind: 'SCHOOL' })).toBe(true);
  });

  it('sorts names A→Z first, dates newest first, and flips on a second click', () => {
    expect(nextSort('-createdAt', 'name')).toBe('name');
    expect(nextSort('name', 'name')).toBe('-name');
    expect(nextSort('-name', 'name')).toBe('name');
    expect(nextSort('name', 'createdAt')).toBe('-createdAt');
    expect(nextSort('-createdAt', 'createdAt')).toBe('createdAt');
    expect(nextSort('createdAt', 'createdAt')).toBe('-createdAt');
    expect(ariaSort('-createdAt', 'createdAt')).toBe('descending');
    expect(ariaSort('name', 'name')).toBe('ascending');
    expect(ariaSort('name', 'createdAt')).toBe('none');
  });
});
