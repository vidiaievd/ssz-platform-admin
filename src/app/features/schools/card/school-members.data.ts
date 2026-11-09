import { Injectable, computed, inject, linkedSignal } from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { map, of } from 'rxjs';
import { adminSchoolsMembers } from '../../../api/organization/functions';
import { AdminMemberPageDto } from '../../../api/organization/models/admin-member-page-dto';
import { OrganizationApi } from '../../../api/organization/organization-api';
import { publicProfilesGetProfilesByUserIds } from '../../../api/user-profile/functions';
import { UserProfileApi } from '../../../api/user-profile/user-profile-api';
import { ApiError } from '../../../core/auth/api-error';
import { ColumnState } from '../schools-list.data';
import { parseMembersQuery, toMembersParams } from './members-query';
import { SchoolCardData } from './school-card.data';

/**
 * Data of the "Members" tab: one roster page from organization, then names from user-profile
 * only for the rows whose roster name is not synced yet — one request for the page, never per
 * row. Names are a side read: when it fails, those rows show "—" and the table stays.
 */
@Injectable()
export class SchoolMembersData {
  private readonly organization = inject(OrganizationApi);
  private readonly profiles = inject(UserProfileApi);
  private readonly card = inject(SchoolCardData);

  readonly query = toSignal(inject(ActivatedRoute).queryParamMap.pipe(map(parseMembersQuery)), {
    requireSync: true,
  });

  private readonly pageResource = rxResource({
    params: () => {
      const schoolId = this.card.schoolId();
      return schoolId ? toMembersParams(schoolId, this.query()) : undefined;
    },
    stream: ({ params }) => this.organization.invoke(adminSchoolsMembers, params),
  });

  /** The page last received; kept while the next one loads, so the table does not blink. */
  readonly page = linkedSignal<AdminMemberPageDto | undefined, AdminMemberPageDto | undefined>({
    source: () => (this.pageResource.hasValue() ? this.pageResource.value() : undefined),
    computation: (next, previous) => next ?? previous?.value,
  });

  readonly loading = computed(() => this.pageResource.isLoading());
  readonly error = computed(() => {
    const error = this.pageResource.error();
    return error ? ApiError.from(error) : null;
  });

  /** Rows without a synced name; at most a page (≤ 100), within the profiles batch limit. */
  private readonly unnamedIds = computed(() => {
    const page = this.page();
    if (!page) return undefined;
    return [...new Set(page.items.filter((m) => !m.name).map((m) => m.userId))];
  });

  private readonly namesResource = rxResource({
    params: () => this.unnamedIds(),
    stream: ({ params: ids }) =>
      ids.length === 0
        ? of(new Map<string, string>())
        : this.profiles
            .invoke(publicProfilesGetProfilesByUserIds, { userIds: ids.join(',') })
            .pipe(map((list) => new Map(list.map((p) => [p.userId, p.displayName])))),
  });

  /** Names from profiles for the unsynced rows. */
  readonly names = computed<ColumnState<ReadonlyMap<string, string>>>(() => {
    if (this.namesResource.error()) return { kind: 'error' };
    if (!this.namesResource.hasValue()) return { kind: 'loading' };
    return { kind: 'ready', value: this.namesResource.value() };
  });

  reload(): void {
    this.pageResource.reload();
  }

  reloadNames(): void {
    this.namesResource.reload();
  }
}
