import { Injectable, Signal, computed, inject, linkedSignal } from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { map, of } from 'rxjs';
import { adminSchoolsList } from '../../api/organization/functions';
import { AdminSchoolPageDto } from '../../api/organization/models/admin-school-page-dto';
import { OrganizationApi } from '../../api/organization/organization-api';
import { adminAccountsLookup } from '../../api/subscription/functions';
import { AccountLookupItemDto } from '../../api/subscription/models/account-lookup-item-dto';
import { SubscriptionApi } from '../../api/subscription/subscription-api';
import { publicProfilesGetProfilesByUserIds } from '../../api/user-profile/functions';
import { UserProfileApi } from '../../api/user-profile/user-profile-api';
import { ApiError } from '../../core/auth/api-error';
import { parseSchoolsQuery, toListParams } from './schools-query';

/** Display name per owner userId; an owner without a profile is simply absent. */
export type OwnerNames = ReadonlyMap<string, string>;
/** Current plan per school id (lookup answers every id, unknown ones on the free plan). */
export type SchoolPlans = ReadonlyMap<string, AccountLookupItemDto>;

/** State of an extra column: it fails on its own and never takes the table down (§5, rule 5). */
export type ColumnState<T> =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error' }
  | { readonly kind: 'ready'; readonly value: T };

/**
 * Data of the schools list: one page from organization, then — in parallel — owners' names
 * from user-profile and current plans from subscription for exactly that page. Provided per
 * page component, so the route is the page's own and the requests die with the page.
 */
@Injectable()
export class SchoolsListData {
  private readonly organization = inject(OrganizationApi);
  private readonly subscription = inject(SubscriptionApi);
  private readonly profiles = inject(UserProfileApi);

  /** The screen as the URL describes it. */
  readonly query = toSignal(inject(ActivatedRoute).queryParamMap.pipe(map(parseSchoolsQuery)), {
    requireSync: true,
  });

  private readonly pageResource = rxResource({
    params: () => toListParams(this.query()),
    stream: ({ params }) => this.organization.invoke(adminSchoolsList, params),
  });

  /** The page last received; kept while the next one loads, so the table does not blink. */
  readonly page = linkedSignal<AdminSchoolPageDto | undefined, AdminSchoolPageDto | undefined>({
    source: () => (this.pageResource.hasValue() ? this.pageResource.value() : undefined),
    computation: (next, previous) => next ?? previous?.value,
  });

  readonly loading = computed(() => this.pageResource.isLoading());
  /** Error of the page itself; a stale page stays visible under it. */
  readonly error = computed(() => {
    const error = this.pageResource.error();
    return error ? ApiError.from(error) : null;
  });

  private readonly ownerIds = computed(() => {
    const page = this.page();
    return page ? [...new Set(page.items.map((s) => s.ownerId))] : undefined;
  });

  private readonly schoolIds = computed(() => this.page()?.items.map((s) => s.id));

  private readonly ownersResource = rxResource({
    params: () => this.ownerIds(),
    stream: ({ params: ids }) =>
      ids.length === 0
        ? of(new Map<string, string>())
        : this.profiles
            .invoke(publicProfilesGetProfilesByUserIds, { userIds: ids.join(',') })
            .pipe(map((list) => new Map(list.map((p) => [p.userId, p.displayName])))),
  });

  private readonly plansResource = rxResource({
    params: () => this.schoolIds(),
    stream: ({ params: ids }) =>
      ids.length === 0
        ? of(new Map<string, AccountLookupItemDto>())
        : this.subscription
            .invoke(adminAccountsLookup, { body: { type: 'workspace', ids } })
            .pipe(map((res) => new Map(res.items.map((item) => [item.externalId, item])))),
  });

  readonly owners = columnState<OwnerNames>(this.ownersResource);
  readonly plans = columnState<SchoolPlans>(this.plansResource);

  reload(): void {
    this.pageResource.reload();
  }

  reloadOwners(): void {
    this.ownersResource.reload();
  }

  reloadPlans(): void {
    this.plansResource.reload();
  }
}

function columnState<T>(resource: {
  hasValue(): boolean;
  value: Signal<T | undefined>;
  error: Signal<unknown>;
}): Signal<ColumnState<T>> {
  return computed(() => {
    if (resource.error()) return { kind: 'error' };
    const value = resource.hasValue() ? resource.value() : undefined;
    return value === undefined ? { kind: 'loading' } : { kind: 'ready', value };
  });
}
