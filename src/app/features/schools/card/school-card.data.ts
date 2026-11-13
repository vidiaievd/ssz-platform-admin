import { Injectable, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { adminSchoolsGet } from '../../../api/organization/functions';
import { OrganizationApi } from '../../../api/organization/organization-api';
import { adminAccountsLookup } from '../../../api/subscription/functions';
import { AccountLookupItemDto } from '../../../api/subscription/models/account-lookup-item-dto';
import { SubscriptionApi } from '../../../api/subscription/subscription-api';
import { ApiError } from '../../../core/auth/api-error';
import { ColumnState } from '../schools-list.data';

/**
 * Data of the school card, shared by its header and its tabs: the school from organization and
 * its current plan from subscription. Provided by the card page, so every tab of one school reads
 * the same requests and switching tabs fetches nothing again. The plan is a side request: when
 * it fails, the header shows "—" with a retry and the card stays (§5, rule 5).
 */
@Injectable()
export class SchoolCardData {
  private readonly organization = inject(OrganizationApi);
  private readonly subscription = inject(SubscriptionApi);

  /** Set by the page from the route; `undefined` until then. */
  readonly schoolId = signal<string | undefined>(undefined);

  private readonly schoolResource = rxResource({
    params: () => this.schoolId(),
    stream: ({ params: schoolId }) => this.organization.invoke(adminSchoolsGet, { schoolId }),
  });

  private readonly planResource = rxResource({
    params: () => this.schoolId(),
    stream: ({ params: id }) =>
      this.subscription
        .invoke(adminAccountsLookup, { body: { type: 'workspace', ids: [id] } })
        // The lookup answers every id it was asked; an unknown school is on the free plan.
        .pipe(map((res) => res.items[0] ?? null)),
  });

  readonly school = computed(() =>
    this.schoolResource.hasValue() ? this.schoolResource.value() : undefined,
  );
  readonly loading = computed(() => this.schoolResource.isLoading());
  readonly error = computed(() => {
    const error = this.schoolResource.error();
    return error ? ApiError.from(error) : null;
  });
  /** Organization does not know the id (non-UUID ids are 404 too). Deleted schools are found. */
  readonly notFound = computed(() => this.error()?.status === 404);

  readonly plan = computed<ColumnState<AccountLookupItemDto | null>>(() => {
    if (this.planResource.error()) return { kind: 'error' };
    if (!this.planResource.hasValue()) return { kind: 'loading' };
    return { kind: 'ready', value: this.planResource.value() ?? null };
  });

  reload(): void {
    this.schoolResource.reload();
  }

  /** After a change of plan or grants (the "Plan" tab) and as the header's retry. */
  reloadPlan(): void {
    this.planResource.reload();
  }
}
