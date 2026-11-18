import { convertToParamMap } from '@angular/router';
import {
  DEFAULT_MEMBERS_QUERY,
  hasMemberFilters,
  parseMembersQuery,
  toMembersParams,
  toMembersQueryParams,
} from './members-query';

const GROUP = '0b5f8d3a-1111-4000-8000-000000000001';

describe('members query', () => {
  it('reads the URL and drops what is malformed', () => {
    expect(parseMembersQuery(convertToParamMap({}))).toEqual(DEFAULT_MEMBERS_QUERY);
    expect(
      parseMembersQuery(
        convertToParamMap({
          role: 'teacher',
          status: 'archived',
          group: GROUP.toUpperCase(),
          page: '3',
          size: '100',
        }),
      ),
    ).toEqual({ role: 'teacher', status: 'archived', group: GROUP, page: 3, size: 100 });
    expect(
      parseMembersQuery(
        convertToParamMap({
          role: 'owner',
          status: 'gone',
          group: 'not-a-uuid',
          page: '0',
          size: '7',
        }),
      ),
    ).toEqual(DEFAULT_MEMBERS_QUERY);
  });

  it('writes only what differs from the default', () => {
    expect(toMembersQueryParams(DEFAULT_MEMBERS_QUERY)).toEqual({
      role: null,
      status: null,
      group: null,
      page: null,
      size: null,
    });
    expect(toMembersQueryParams({ role: 'student', status: 'active', page: 2, size: 25 })).toEqual({
      role: 'student',
      status: 'active',
      group: null,
      page: 2,
      size: 25,
    });
  });

  it('turns the query into the request', () => {
    expect(toMembersParams('s-1', DEFAULT_MEMBERS_QUERY)).toEqual({
      schoolId: 's-1',
      page: 1,
      limit: 50,
    });
    expect(
      toMembersParams('s-1', { role: 'staff', status: 'active', group: GROUP, page: 2, size: 25 }),
    ).toEqual({
      schoolId: 's-1',
      role: 'staff',
      status: 'active',
      groupId: GROUP,
      page: 2,
      limit: 25,
    });
  });

  it('knows when the list is narrowed', () => {
    expect(hasMemberFilters(DEFAULT_MEMBERS_QUERY)).toBe(false);
    expect(hasMemberFilters({ ...DEFAULT_MEMBERS_QUERY, page: 4 })).toBe(false);
    expect(hasMemberFilters({ ...DEFAULT_MEMBERS_QUERY, group: GROUP })).toBe(true);
  });
});
