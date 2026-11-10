import { Component, DestroyRef, computed, inject, linkedSignal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { ButtonDirective } from 'primeng/button';
import { IconField } from 'primeng/iconfield';
import { InputIcon } from 'primeng/inputicon';
import { InputText } from 'primeng/inputtext';
import { Paginator, PaginatorState } from 'primeng/paginator';
import { Select } from 'primeng/select';
import { Skeleton } from 'primeng/skeleton';
import { TableModule } from 'primeng/table';
import { Tag } from 'primeng/tag';
import { Subject, debounceTime, distinctUntilChanged, map } from 'rxjs';
import { AdminSchoolListItemDto } from '../../api/organization/models/admin-school-list-item-dto';
import { AccountLookupItemDto } from '../../api/subscription/models/account-lookup-item-dto';
import { ApiError } from '../../core/auth/api-error';
import { LanguageService } from '../../core/i18n/language.service';
import { LocalDatePipe } from '../../shared/local-date.pipe';
import { seatLevel, seatLevelClass, seatsText } from './seats';
import { SchoolsListData } from './schools-list.data';
import {
  DEFAULT_SCHOOLS_QUERY,
  PAGE_SIZES,
  SCHOOL_KINDS,
  SCHOOL_STATUSES,
  SEATS_FILTERS,
  SchoolKind,
  SchoolStatus,
  SchoolsQuery,
  SeatsFilter,
  SortableColumn,
  ariaSort,
  hasFilters,
  nextSort,
  toSchoolsQueryParams,
  withFilter,
} from './schools-query';

const SEARCH_DEBOUNCE_MS = 300;
const SKELETON_ROWS = Array.from({ length: 8 }, (_, i) => i);

const STATUS_SEVERITY: Record<SchoolStatus, 'success' | 'warn' | 'danger'> = {
  active: 'success',
  inactive: 'warn',
  deleted: 'danger',
};

/**
 * `/schools` — every school of the platform, read only (plan 90, phase 2, step 6). The whole
 * screen — search, filters, sort, page and its size — lives in the URL, so a link reproduces
 * it and back/forward walk through it. Owners and plans are extra columns: when one of them
 * fails, its cells show "—" with a retry, and the table stays.
 */
@Component({
  selector: 'app-schools-list-page',
  providers: [SchoolsListData],
  imports: [
    FormsModule,
    RouterLink,
    TranslocoPipe,
    ButtonDirective,
    IconField,
    InputIcon,
    InputText,
    Paginator,
    Select,
    Skeleton,
    TableModule,
    Tag,
    LocalDatePipe,
  ],
  template: `
    <section class="flex flex-col gap-4">
      <div class="flex flex-wrap items-baseline justify-between gap-2">
        <h1 class="text-2xl font-semibold" data-testid="page-title">
          {{ 'nav.schools' | transloco }}
        </h1>
        @if (data.page(); as page) {
          <span class="text-muted-color text-sm" data-testid="schools-total">
            {{ 'schools.total' | transloco: { count: page.total } }}
          </span>
        }
      </div>

      <div class="flex flex-wrap items-center gap-2" role="search">
        <p-iconfield class="w-full sm:w-72">
          <p-inputicon class="pi pi-search" />
          <input
            pInputText
            type="search"
            class="w-full"
            maxlength="100"
            [value]="searchText()"
            [placeholder]="'schools.search' | transloco"
            [attr.aria-label]="'schools.search' | transloco"
            data-testid="schools-search"
            (input)="onSearchInput($event)"
          />
        </p-iconfield>
        <p-select
          class="w-full sm:w-44"
          [options]="kinds"
          [ngModel]="query().kind"
          (ngModelChange)="setKind($event)"
          [showClear]="true"
          [placeholder]="'schools.allKinds' | transloco"
          [ariaLabel]="'schools.columns.kind' | transloco"
          data-testid="schools-kind"
        >
          <ng-template #item let-kind>{{ 'schools.kind.' + kind | transloco }}</ng-template>
          <ng-template #selectedItem let-kind>{{ 'schools.kind.' + kind | transloco }}</ng-template>
        </p-select>
        <p-select
          class="w-full sm:w-44"
          [options]="statuses"
          [ngModel]="query().status"
          (ngModelChange)="setStatus($event)"
          [showClear]="true"
          [placeholder]="'schools.allStatuses' | transloco"
          [ariaLabel]="'schools.columns.status' | transloco"
          data-testid="schools-status"
        >
          <ng-template #item let-status>{{ 'schools.status.' + status | transloco }}</ng-template>
          <ng-template #selectedItem let-status>
            {{ 'schools.status.' + status | transloco }}
          </ng-template>
        </p-select>
        <p-select
          class="w-full sm:w-44"
          [options]="seatFilters"
          [ngModel]="query().seats"
          (ngModelChange)="setSeats($event)"
          [showClear]="true"
          [placeholder]="'schools.allSeats' | transloco"
          [ariaLabel]="'schools.columns.seats' | transloco"
          data-testid="schools-seats"
        >
          <ng-template #item let-seats>{{
            'schools.seatsFilter.' + seats | transloco
          }}</ng-template>
          <ng-template #selectedItem let-seats>
            {{ 'schools.seatsFilter.' + seats | transloco }}
          </ng-template>
        </p-select>
        @if (filtered()) {
          <button
            pButton
            type="button"
            [text]="true"
            severity="secondary"
            data-testid="schools-reset"
            (click)="resetFilters()"
          >
            <i class="pi pi-filter-slash" aria-hidden="true"></i>
            {{ 'schools.reset' | transloco }}
          </button>
        }
      </div>

      @if (pageError(); as error) {
        <div
          role="alert"
          class="flex flex-wrap items-center gap-3 rounded-md border border-red-300 px-3 py-2 text-sm dark:border-red-800"
          data-testid="schools-error"
        >
          <i class="pi pi-exclamation-triangle text-red-500" aria-hidden="true"></i>
          <span>{{ error | transloco }}</span>
          <button pButton type="button" size="small" [outlined]="true" (click)="data.reload()">
            {{ 'schools.retry' | transloco }}
          </button>
        </div>
      }

      @if (data.owners().kind === 'error' || data.plans().kind === 'error') {
        <div
          class="text-muted-color flex flex-wrap items-center gap-x-3 gap-y-1 text-sm"
          data-testid="schools-column-errors"
        >
          @if (data.owners().kind === 'error') {
            <span>
              {{ 'schools.ownersFailed' | transloco }} ·
              <button type="button" class="text-primary underline" (click)="data.reloadOwners()">
                {{ 'schools.retry' | transloco }}
              </button>
            </span>
          }
          @if (data.plans().kind === 'error') {
            <span>
              {{ 'schools.plansFailed' | transloco }} ·
              <button type="button" class="text-primary underline" (click)="data.reloadPlans()">
                {{ 'schools.retry' | transloco }}
              </button>
            </span>
          }
        </div>
      }

      @if (data.page(); as page) {
        <div class="overflow-x-auto">
          <p-table
            [value]="page.items"
            [loading]="data.loading()"
            dataKey="id"
            size="small"
            [rowHover]="true"
            [tableStyle]="{ 'min-width': '60rem' }"
          >
            <ng-template #header>
              <tr>
                <th [attr.aria-sort]="sortState('name')">
                  <button
                    type="button"
                    class="flex cursor-pointer items-center gap-2"
                    data-testid="sort-name"
                    (click)="sortBy('name')"
                  >
                    {{ 'schools.columns.name' | transloco }}
                    <i [class]="sortIcon('name')" aria-hidden="true"></i>
                  </button>
                </th>
                <th>{{ 'schools.columns.kind' | transloco }}</th>
                <th>{{ 'schools.columns.owner' | transloco }}</th>
                <th>{{ 'schools.columns.plan' | transloco }}</th>
                <th>{{ 'schools.columns.status' | transloco }}</th>
                <th class="text-right">{{ 'schools.columns.students' | transloco }}</th>
                <th class="text-right">{{ 'schools.columns.seats' | transloco }}</th>
                <th class="text-right">{{ 'schools.columns.teachers' | transloco }}</th>
                <th [attr.aria-sort]="sortState('createdAt')">
                  <button
                    type="button"
                    class="flex cursor-pointer items-center gap-2"
                    data-testid="sort-createdAt"
                    (click)="sortBy('createdAt')"
                  >
                    {{ 'schools.columns.createdAt' | transloco }}
                    <i [class]="sortIcon('createdAt')" aria-hidden="true"></i>
                  </button>
                </th>
              </tr>
            </ng-template>

            <ng-template #body let-row>
              @let school = asSchool(row);
              <tr
                class="cursor-pointer"
                data-testid="school-row"
                (click)="open(school)"
                (keydown.enter)="open(school)"
              >
                <td>
                  <a
                    class="font-medium hover:underline"
                    [routerLink]="[school.id]"
                    (click)="$event.stopPropagation()"
                    >{{ school.name }}</a
                  >
                  <div class="text-muted-color text-xs">
                    {{ school.slug }}{{ school.city ? ' · ' + school.city : '' }}
                  </div>
                </td>
                <td>{{ 'schools.kind.' + school.kind | transloco }}</td>
                <td data-testid="school-owner">
                  @switch (data.owners().kind) {
                    @case ('loading') {
                      <p-skeleton width="7rem" />
                    }
                    @default {
                      {{ ownerName(school.ownerId) ?? '—' }}
                    }
                  }
                </td>
                <td data-testid="school-plan">
                  @switch (data.plans().kind) {
                    @case ('loading') {
                      <p-skeleton width="6rem" />
                    }
                    @default {
                      @if (planOf(school.id); as account) {
                        @if (account.plan; as plan) {
                          {{ plan.name }}
                          <span class="text-muted-color text-xs">v{{ plan.version }}</span>
                          @if (account.subscription?.status === 'trial') {
                            <p-tag
                              class="ml-1"
                              severity="info"
                              [value]="'schools.trial' | transloco"
                            />
                          }
                        } @else {
                          —
                        }
                      } @else {
                        —
                      }
                    }
                  }
                </td>
                <td>
                  <p-tag
                    [severity]="statusSeverity[school.status]"
                    [value]="'schools.status.' + school.status | transloco"
                  />
                </td>
                <td class="text-right tabular-nums">{{ school.counts.students }}</td>
                <td
                  class="text-right whitespace-nowrap tabular-nums"
                  [class]="seatClass(school)"
                  data-testid="school-seats"
                  [attr.data-level]="seatLevelOf(school)"
                >
                  {{ seatsOf(school) }}
                </td>
                <!-- A tutor's workspace has no teacher rows: its only teacher is the owner. -->
                <td class="text-right tabular-nums" data-testid="school-teachers">
                  {{ school.kind === 'SOLO' ? '—' : school.counts.teachers }}
                </td>
                <td class="whitespace-nowrap">{{ school.createdAt | localDate: lang() }}</td>
              </tr>
            </ng-template>

            <ng-template #emptymessage>
              <tr>
                <td colspan="9" class="py-8 text-center" data-testid="schools-empty">
                  @if (page.total > 0) {
                    <p class="mb-2">{{ 'schools.emptyPage' | transloco }}</p>
                    <button pButton type="button" [outlined]="true" (click)="goToPage(1)">
                      {{ 'schools.firstPage' | transloco }}
                    </button>
                  } @else if (filtered()) {
                    <p class="mb-2">{{ 'schools.emptyFiltered' | transloco }}</p>
                    <button pButton type="button" [outlined]="true" (click)="resetFilters()">
                      {{ 'schools.reset' | transloco }}
                    </button>
                  } @else {
                    <p>{{ 'schools.empty' | transloco }}</p>
                  }
                </td>
              </tr>
            </ng-template>
          </p-table>
        </div>

        @if (page.total > 0) {
          <p-paginator
            [first]="(query().page - 1) * query().size"
            [rows]="query().size"
            [totalRecords]="page.total"
            [rowsPerPageOptions]="pageSizes"
            data-testid="schools-paginator"
            (onPageChange)="onPage($event)"
          />
        }
      } @else if (!pageError()) {
        <div class="flex flex-col gap-3" data-testid="schools-skeleton" aria-busy="true">
          @for (i of skeletonRows; track i) {
            <p-skeleton height="2.5rem" />
          }
        </div>
      }
    </section>
  `,
})
export class SchoolsListPage {
  protected readonly data = inject(SchoolsListData);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly lang = inject(LanguageService).current;

  protected readonly query = this.data.query;
  protected readonly filtered = computed(() => hasFilters(this.query()));

  protected readonly kinds = [...SCHOOL_KINDS];
  protected readonly statuses = [...SCHOOL_STATUSES];
  protected readonly seatFilters = [...SEATS_FILTERS];
  protected readonly pageSizes = [...PAGE_SIZES];
  protected readonly statusSeverity = STATUS_SEVERITY;
  protected readonly skeletonRows = SKELETON_ROWS;

  /**
   * What the search box shows. Follows the URL (back/forward), but keeps what is being typed
   * when the URL only trimmed it — otherwise a trailing space would vanish mid-word.
   */
  protected readonly searchText = linkedSignal<string, string>({
    source: () => this.query().search,
    computation: (search, previous) =>
      previous && previous.value.trim() === search ? previous.value : search,
  });

  /** Translation key of the page's error, if any. */
  protected readonly pageError = computed(() => {
    const error = this.data.error();
    return error ? errorKey(error) : null;
  });

  private readonly searchInput = new Subject<string>();

  constructor() {
    this.searchInput
      .pipe(
        map((text) => text.trim()),
        debounceTime(SEARCH_DEBOUNCE_MS),
        distinctUntilChanged(),
        takeUntilDestroyed(inject(DestroyRef)),
      )
      .subscribe((search) => {
        // Typing replaces the history entry: back goes to the previous screen, not letter by letter.
        if (search !== this.query().search)
          this.navigate(withFilter(this.query(), { search }), true);
      });
  }

  protected onSearchInput(event: Event): void {
    const text = (event.target as HTMLInputElement).value;
    this.searchText.set(text);
    this.searchInput.next(text);
  }

  protected setKind(kind: SchoolKind | null): void {
    this.navigate(withFilter(this.query(), { kind: kind ?? null }));
  }

  protected setStatus(status: SchoolStatus | null): void {
    this.navigate(withFilter(this.query(), { status: status ?? null }));
  }

  protected setSeats(seats: SeatsFilter | null): void {
    this.navigate(withFilter(this.query(), { seats: seats ?? null }));
  }

  protected seatsOf(school: AdminSchoolListItemDto): string {
    return seatsText(school.seats.used, school.seats.limit);
  }

  protected seatLevelOf(school: AdminSchoolListItemDto) {
    return seatLevel(school.seats.used, school.seats.limit);
  }

  protected seatClass(school: AdminSchoolListItemDto): string {
    return seatLevelClass(this.seatLevelOf(school));
  }

  protected resetFilters(): void {
    const { sort, size } = this.query();
    this.navigate({ ...DEFAULT_SCHOOLS_QUERY, sort, size });
  }

  protected sortBy(column: SortableColumn): void {
    this.navigate({ ...this.query(), sort: nextSort(this.query().sort, column), page: 1 });
  }

  protected sortState(column: SortableColumn) {
    return ariaSort(this.query().sort, column);
  }

  protected sortIcon(column: SortableColumn): string {
    const state = ariaSort(this.query().sort, column);
    if (state === 'ascending') return 'pi pi-sort-amount-up-alt';
    if (state === 'descending') return 'pi pi-sort-amount-down';
    return 'pi pi-sort-alt text-muted-color';
  }

  protected onPage(event: PaginatorState): void {
    const size = event.rows ?? this.query().size;
    const page = size !== this.query().size ? 1 : Math.floor((event.first ?? 0) / size) + 1;
    if (size === this.query().size && page === this.query().page) return;
    this.navigate({ ...this.query(), page, size });
  }

  protected goToPage(page: number): void {
    this.navigate({ ...this.query(), page });
  }

  protected open(school: AdminSchoolListItemDto): void {
    void this.router.navigate([school.id], { relativeTo: this.route });
  }

  protected ownerName(ownerId: string): string | undefined {
    const owners = this.data.owners();
    return owners.kind === 'ready' ? owners.value.get(ownerId) : undefined;
  }

  protected planOf(schoolId: string): AccountLookupItemDto | undefined {
    const plans = this.data.plans();
    return plans.kind === 'ready' ? plans.value.get(schoolId) : undefined;
  }

  /** p-table's row context is untyped; the rows are always this page's items. */
  protected asSchool(row: unknown): AdminSchoolListItemDto {
    return row as AdminSchoolListItemDto;
  }

  private navigate(query: SchoolsQuery, replaceUrl = false): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: toSchoolsQueryParams(query),
      replaceUrl,
    });
  }
}

function errorKey(error: ApiError): string {
  if (error.isNetworkError) return 'schools.errors.network';
  if (error.status === 403) return 'schools.errors.forbidden';
  return 'schools.errors.generic';
}
