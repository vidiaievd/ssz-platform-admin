import { Injectable, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { adminAccountsLookup } from '../../../api/subscription/functions';
import { AccountLookupItemDto } from '../../../api/subscription/models/account-lookup-item-dto';
import { SubscriptionApi } from '../../../api/subscription/subscription-api';
import { AdminUserDetail, AdminUsersApi } from '../../../core/auth/admin-users.api';
import { ApiError } from '../../../core/auth/api-error';
import { PayerCard, PayerSeats } from '../../schools/card/payer-card';
import { ColumnState } from '../../schools/schools-list.data';

/**
 * Data of the user card, shared by its header and its tabs: the account from auth and the
 * learner's own plan from subscription (a `user` payer). Provided by the card page, so switching
 * tabs reads nothing again. The plan is a side read: when it fails the header shows "—" with a
 * retry and the card stays (§5, rule 5).
 */
@Injectable()
export class UserCardData extends PayerCard {
  private readonly users = inject(AdminUsersApi);
  private readonly subscription = inject(SubscriptionApi);

  readonly payerType = 'user' as const;

  /** Set by the page from the route; `undefined` until then. */
  readonly userId = signal<string | undefined>(undefined);
  readonly payerId = this.userId.asReadonly();

  private readonly userResource = rxResource({
    params: () => this.userId(),
    stream: ({ params: userId }) => this.users.get(userId),
  });

  private readonly planResource = rxResource({
    params: () => this.userId(),
    stream: ({ params: id }) =>
      this.subscription
        .invoke(adminAccountsLookup, { body: { type: 'user', ids: [id] } })
        // The lookup answers every id it was asked; an unknown learner is on the free plan.
        .pipe(map((res) => res.items[0] ?? null)),
  });

  readonly user = computed(() =>
    this.userResource.hasValue() ? this.userResource.value() : undefined,
  );
  readonly error = computed(() => {
    const error = this.userResource.error();
    return error ? ApiError.from(error) : null;
  });
  /** auth does not know the id (a non-UUID id is 404 too). */
  readonly notFound = computed(() => this.error()?.status === 404);

  readonly plan = computed<ColumnState<AccountLookupItemDto | null>>(() => {
    if (this.planResource.error()) return { kind: 'error' };
    if (!this.planResource.hasValue()) return { kind: 'loading' };
    return { kind: 'ready', value: this.planResource.value() ?? null };
  });

  /** A learner has no seats. */
  readonly seats = signal<PayerSeats | null>(null).asReadonly();

  /** Reads the account again (the retry, and after a refused action that changed nothing). */
  reload(): void {
    this.userResource.reload();
  }

  /** An action answers the card as it is afterwards: no second read. */
  setUser(user: AdminUserDetail): void {
    this.userResource.set(user);
  }

  reloadPlan(): void {
    this.planResource.reload();
  }

  /** Nothing else on the user card follows the plan. */
  afterPlanChange(): void {
    // A learner's card shows no seats or anything else a plan moves.
  }
}
