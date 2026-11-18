import { convertToParamMap } from '@angular/router';
import {
  DEFAULT_USERS_QUERY,
  DELETION_QUEUE_QUERY,
  isDeletionQueue,
  nextUserSort,
  parseUsersQuery,
  searchTooShort,
  toUserListParams,
  toUsersQueryParams,
  userAriaSort,
  withUserFilter,
} from './users-query';

const parse = (params: Record<string, string>) => parseUsersQuery(convertToParamMap(params));

describe('users query', () => {
  it('reads the URL', () => {
    expect(
      parse({
        q: ' ola@ ',
        role: 'tutor',
        status: 'blocked',
        sort: 'email',
        page: '3',
        size: '50',
      }),
    ).toEqual({
      search: 'ola@',
      role: 'tutor',
      status: 'blocked',
      sort: 'email',
      page: 3,
      size: 50,
    });
  });

  it('falls back silently on anything unknown', () => {
    expect(parse({ role: 'king', status: 'sleepy', sort: 'name', page: '0', size: '33' })).toEqual(
      DEFAULT_USERS_QUERY,
    );
    expect(parse({ page: '-1' }).page).toBe(1);
  });

  it('writes no defaults to the URL', () => {
    expect(toUsersQueryParams(DEFAULT_USERS_QUERY)).toEqual({
      q: null,
      role: null,
      status: null,
      sort: null,
      page: null,
      size: null,
    });
    expect(toUsersQueryParams(DELETION_QUEUE_QUERY)).toMatchObject({
      status: 'deletion_pending',
      sort: 'purgeAt',
    });
  });

  it('does not send a one-letter search (auth would answer 400)', () => {
    const short = { ...DEFAULT_USERS_QUERY, search: 'o' };
    expect(searchTooShort(short)).toBe(true);
    expect(toUserListParams(short)).toEqual({ sort: '-createdAt', page: 1, limit: 25 });
    expect(searchTooShort(DEFAULT_USERS_QUERY)).toBe(false);
    expect(toUserListParams({ ...short, search: 'ol' }).search).toBe('ol');
  });

  it('sends the filters it has', () => {
    expect(toUserListParams({ ...DELETION_QUEUE_QUERY, role: 'student', page: 2 })).toEqual({
      role: 'student',
      status: 'deletion_pending',
      sort: 'purgeAt',
      page: 2,
      limit: 25,
    });
  });

  it('knows the deletion queue by its status and order', () => {
    expect(isDeletionQueue(DELETION_QUEUE_QUERY)).toBe(true);
    expect(isDeletionQueue({ ...DELETION_QUEUE_QUERY, page: 4 })).toBe(true);
    expect(isDeletionQueue({ ...DELETION_QUEUE_QUERY, sort: '-createdAt' })).toBe(false);
  });

  it('starts a filter change from page 1 and drops the erasure order outside the queue', () => {
    expect(withUserFilter({ ...DEFAULT_USERS_QUERY, page: 5 }, { role: 'tutor' })).toMatchObject({
      role: 'tutor',
      page: 1,
    });
    expect(withUserFilter(DELETION_QUEUE_QUERY, { status: 'blocked' }).sort).toBe('-createdAt');
    expect(withUserFilter(DELETION_QUEUE_QUERY, { role: 'student' }).sort).toBe('purgeAt');
  });

  it('flips e-mail and creation order; last sign-in and erasure go one way', () => {
    expect(nextUserSort('-createdAt', 'email')).toBe('email');
    expect(nextUserSort('email', 'email')).toBe('-email');
    expect(nextUserSort('-createdAt', 'createdAt')).toBe('createdAt');
    expect(nextUserSort('createdAt', 'createdAt')).toBe('-createdAt');
    expect(nextUserSort('-lastLoginAt', 'lastLoginAt')).toBe('-lastLoginAt');
    expect(nextUserSort('email', 'purgeAt')).toBe('purgeAt');
    expect(userAriaSort('-lastLoginAt', 'lastLoginAt')).toBe('descending');
    expect(userAriaSort('purgeAt', 'purgeAt')).toBe('ascending');
    expect(userAriaSort('email', 'createdAt')).toBe('none');
  });
});
