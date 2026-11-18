import { Injectable, computed, inject } from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { Observable, catchError, forkJoin, map, of } from 'rxjs';
import { AnalyticsApi } from '../../../api/analytics/analytics-api';
import { adminUsage } from '../../../api/analytics/functions';
import { AdminUsageDto } from '../../../api/analytics/models/admin-usage-dto';
import { adminSchoolsList } from '../../../api/organization/functions';
import { OrganizationApi } from '../../../api/organization/organization-api';
import { publicProfilesGetProfilesByUserIds } from '../../../api/user-profile/functions';
import { UserProfileApi } from '../../../api/user-profile/user-profile-api';
import { ColumnState } from '../../schools/schools-list.data';
import { stateOf } from '../../schools/card/plan/school-plan.data';
import {
  PayerNames,
  PayerType,
  TOP_PAYERS,
  capabilityUsageRows,
  othersRow,
  parsePayerType,
  payerIds,
  payerRows,
  usageTotal,
  weekRows,
} from './payer-spend-model';
import { SpendRange, parseSpendRange } from './spend-period';

type Grouping = 'payer' | 'capability' | 'week';

/** Names as read; `failed` lists the kinds that could not be read (their rows show ids). */
interface NamesRead extends PayerNames {
  readonly failed: readonly ('schools' | 'users')[];
}

/**
 * Data of the per-payer block of "AI → Spend" (plan 90, §6.7, step 17): analytics'
 * `GET admin/ai/usage` three times — top payers, per agent, per ISO week — for the period of
 * the page and the payer kind in `?payer=`. Each read fails on its own. Names of the top come
 * after it: schools from organization (`admin/schools?ids=`), learners from user-profile; a
 * name that cannot be read leaves the id, never the row.
 */
@Injectable()
export class PayerSpendData {
  private readonly analytics = inject(AnalyticsApi);
  private readonly organization = inject(OrganizationApi);
  private readonly profiles = inject(UserProfileApi);
  private readonly query = inject(ActivatedRoute).queryParamMap;

  readonly range = toSignal<SpendRange>(
    this.query.pipe(map((p) => parseSpendRange(p.get('from'), p.get('to')))),
    { requireSync: true, equal: (a, b) => a.from === b.from && a.to === b.to },
  );
  readonly payerType = toSignal<PayerType | null>(
    this.query.pipe(map((p) => parsePayerType(p.get('payer')))),
    { requireSync: true },
  );

  private readonly params = computed(() => ({ ...this.range(), payerType: this.payerType() }));

  private usage(groupBy: Grouping) {
    return rxResource({
      params: () => this.params(),
      stream: ({ params: { from, to, payerType } }) =>
        this.analytics.invoke(adminUsage, {
          from,
          to,
          groupBy,
          payerType: payerType ?? undefined,
          ...(groupBy === 'payer' ? { limit: String(TOP_PAYERS) } : {}),
        }),
    });
  }

  private readonly payerResource = this.usage('payer');
  private readonly capabilityResource = this.usage('capability');
  private readonly weekResource = this.usage('week');

  readonly payers = computed<ColumnState<AdminUsageDto>>(() => stateOf(this.payerResource));
  readonly capabilities = computed<ColumnState<AdminUsageDto>>(() =>
    stateOf(this.capabilityResource),
  );
  readonly weeks = computed<ColumnState<AdminUsageDto>>(() => stateOf(this.weekResource));

  /** Ids of the top, keyed by value so a re-read with the same payers asks for no names. */
  private readonly ids = computed(
    () => {
      const s = this.payers();
      return s.kind === 'ready' ? payerIds(s.value) : undefined;
    },
    {
      equal: (a, b) =>
        a?.schools.join() === b?.schools.join() && a?.users.join() === b?.users.join(),
    },
  );

  private readonly namesResource = rxResource({
    params: () => this.ids(),
    stream: ({ params: { schools, users } }) =>
      forkJoin({
        schools: this.schoolNames(schools),
        users: this.userNames(users),
      }).pipe(
        map((r): NamesRead => ({
          schools: r.schools ?? new Map(),
          users: r.users ?? new Map(),
          failed: [
            ...(r.schools ? [] : (['schools'] as const)),
            ...(r.users ? [] : (['users'] as const)),
          ],
        })),
      ),
  });

  private readonly names = computed(() =>
    this.namesResource.hasValue() ? (this.namesResource.value() ?? null) : null,
  );
  /** Kinds of names that could not be read; their rows show ids. */
  readonly namesFailed = computed(() => this.names()?.failed ?? []);

  readonly total = computed(() => {
    const s = this.payers();
    return s.kind === 'ready' ? usageTotal(s.value) : null;
  });
  readonly payerCount = computed(() => {
    const s = this.payers();
    return s.kind === 'ready' ? (s.value.payers ?? s.value.items.length) : null;
  });
  readonly payerRows = computed(() => {
    const s = this.payers();
    return s.kind === 'ready' ? payerRows(s.value, this.names()) : [];
  });
  readonly others = computed(() => {
    const s = this.payers();
    return s.kind === 'ready' ? othersRow(s.value) : null;
  });
  readonly capabilityRows = computed(() => {
    const s = this.capabilities();
    return s.kind === 'ready' ? capabilityUsageRows(s.value) : [];
  });
  readonly weekRows = computed(() => {
    const s = this.weeks();
    return s.kind === 'ready' ? weekRows(s.value) : [];
  });

  reloadPayers(): void {
    this.payerResource.reload();
  }
  reloadCapabilities(): void {
    this.capabilityResource.reload();
  }
  reloadWeeks(): void {
    this.weekResource.reload();
  }
  reloadAll(): void {
    this.reloadPayers();
    this.reloadCapabilities();
    this.reloadWeeks();
  }

  /** Null = the read failed. */
  private schoolNames(ids: string[]): Observable<PayerNames['schools'] | null> {
    if (ids.length === 0) return of(new Map());
    return this.organization
      .invoke(adminSchoolsList, { ids: ids.join(','), limit: ids.length })
      .pipe(
        map(
          (page) =>
            new Map(page.items.map((s) => [s.id, { name: s.name, slug: s.slug, kind: s.kind }])),
        ),
        catchError(() => of(null)),
      );
  }

  private userNames(ids: string[]): Observable<PayerNames['users'] | null> {
    if (ids.length === 0) return of(new Map());
    return this.profiles
      .invoke(publicProfilesGetProfilesByUserIds, { userIds: ids.join(',') })
      .pipe(
        map((list) => new Map(list.map((p) => [p.userId, p.displayName]))),
        catchError(() => of(null)),
      );
  }
}
