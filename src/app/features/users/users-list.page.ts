import { Component, DestroyRef, computed, inject, linkedSignal } from '@angular/core';
import { rxResource, takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
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
import { Subject, debounceTime, distinctUntilChanged, map } from 'rxjs';
import {
  AdminUserListItem,
  AdminUserPage,
  AdminUsersApi,
  USER_ROLES,
  USER_STATUSES,
  UserRole,
  UserStatus,
} from '../../core/auth/admin-users.api';
import { ApiError } from '../../core/auth/api-error';
import { IfLevelDirective } from '../../core/auth/if-level.directive';
import { LanguageService } from '../../core/i18n/language.service';
import { LevelBadge } from '../../layout/level-badge';
import { LocalDatePipe } from '../../shared/local-date.pipe';
import { UserBadges } from './user-badges';
import { roleKey } from './user-roles';
import {
  DEFAULT_USERS_QUERY,
  DELETION_QUEUE_QUERY,
  USER_PAGE_SIZES,
  USER_SEARCH_MAX,
  USER_SEARCH_MIN,
  UserSortableColumn,
  UsersQuery,
  hasUserFilters,
  isDeletionQueue,
  nextUserSort,
  cleanedUsersParams,
  parseUsersQuery,
  searchTooShort,
  toUserListParams,
  toUsersQueryParams,
  userAriaSort,
  withUserFilter,
} from './users-query';

const SEARCH_DEBOUNCE_MS = 300;
const SKELETON_ROWS = Array.from({ length: 8 }, (_, i) => i);

/**
 * `/users` — every account of the platform from auth (plan 90, phase 6, step 6). Search by
 * e-mail, role, status, sort, page and its size live in the URL. The preset "Deletion requests"
 * is `status=deletion_pending&sort=purgeAt` — the soonest erasure first, with its date. Read only:
 * actions are on the card (step 8).
 */
@Component({
  selector: 'app-users-list-page',
  imports: [
    FormsModule,
    RouterLink,
    TranslocoPipe,
    ButtonDirective,
    IfLevelDirective,
    IconField,
    InputIcon,
    InputText,
    Paginator,
    Select,
    Skeleton,
    TableModule,
    LevelBadge,
    LocalDatePipe,
    UserBadges,
  ],
  template: `
    <section class="flex flex-col gap-4">
      <div class="flex flex-wrap items-baseline justify-between gap-2">
        <h1 class="text-2xl font-semibold" data-testid="page-title">
          {{ (deletionQueue() ? 'users.deletionQueue' : 'nav.users') | transloco }}
        </h1>
        <span class="flex items-baseline gap-4">
          @if (page(); as page) {
            <span class="text-muted-color text-sm" data-testid="users-total">
              {{ 'users.total' | transloco: { count: page.total } }}
            </span>
          }
          <a
            *appIfLevel="'super'"
            class="text-primary flex items-center gap-1 text-sm hover:underline"
            routerLink="/users/admins"
            data-testid="users-admins-link"
          >
            <i class="pi pi-shield" aria-hidden="true"></i>
            {{ 'users.admins.title' | transloco }}
          </a>
        </span>
      </div>

      <div class="flex flex-wrap items-center gap-2" role="search">
        <p-iconfield class="w-full sm:w-72">
          <p-inputicon class="pi pi-search" />
          <input
            pInputText
            type="search"
            class="w-full"
            [attr.maxlength]="searchMax"
            [value]="searchText()"
            [placeholder]="'users.search' | transloco"
            [attr.aria-label]="'users.search' | transloco"
            data-testid="users-search"
            (input)="onSearchInput($event)"
          />
        </p-iconfield>
        <p-select
          class="w-full sm:w-48"
          [options]="roles"
          [ngModel]="query().role"
          (ngModelChange)="setRole($event)"
          [showClear]="true"
          [placeholder]="'users.allRoles' | transloco"
          [ariaLabel]="'users.columns.roles' | transloco"
          data-testid="users-role"
        >
          <ng-template #item let-role>{{ 'users.role.' + role | transloco }}</ng-template>
          <ng-template #selectedItem let-role>{{ 'users.role.' + role | transloco }}</ng-template>
        </p-select>
        <p-select
          class="w-full sm:w-52"
          [options]="statuses"
          [ngModel]="query().status"
          (ngModelChange)="setStatus($event)"
          [showClear]="true"
          [placeholder]="'users.allStatuses' | transloco"
          [ariaLabel]="'users.columns.status' | transloco"
          data-testid="users-status"
        >
          <ng-template #item let-status>{{ 'users.status.' + status | transloco }}</ng-template>
          <ng-template #selectedItem let-status>
            {{ 'users.status.' + status | transloco }}
          </ng-template>
        </p-select>
        <button
          pButton
          type="button"
          severity="secondary"
          [outlined]="!deletionQueue()"
          [attr.aria-pressed]="deletionQueue()"
          data-testid="users-deletion-preset"
          (click)="toggleDeletionQueue()"
        >
          <i class="pi pi-trash" aria-hidden="true"></i>
          {{ 'users.deletionQueue' | transloco }}
        </button>
        @if (filtered()) {
          <button
            pButton
            type="button"
            [text]="true"
            severity="secondary"
            data-testid="users-reset"
            (click)="resetFilters()"
          >
            <i class="pi pi-filter-slash" aria-hidden="true"></i>
            {{ 'users.reset' | transloco }}
          </button>
        }
      </div>

      @if (shortSearch()) {
        <p class="text-muted-color text-sm" data-testid="users-search-short">
          {{ 'users.searchTooShort' | transloco: { min: searchMin } }}
        </p>
      }

      @if (pageError(); as error) {
        <div
          role="alert"
          class="flex flex-wrap items-center gap-3 rounded-md border border-red-300 px-3 py-2 text-sm dark:border-red-800"
          data-testid="users-error"
        >
          <i class="pi pi-exclamation-triangle text-red-500" aria-hidden="true"></i>
          <span>{{ error | transloco }}</span>
          <button pButton type="button" size="small" [outlined]="true" (click)="reload()">
            {{ 'users.retry' | transloco }}
          </button>
        </div>
      }

      @if (page(); as page) {
        <div class="overflow-x-auto">
          <p-table
            [value]="rows(page)"
            [loading]="loading()"
            dataKey="id"
            size="small"
            [rowHover]="true"
            [tableStyle]="{ 'min-width': '60rem' }"
          >
            <ng-template #header>
              <tr>
                <th [attr.aria-sort]="sortState('email')">
                  <button
                    type="button"
                    class="flex cursor-pointer items-center gap-2"
                    data-testid="sort-email"
                    (click)="sortBy('email')"
                  >
                    {{ 'users.columns.email' | transloco }}
                    <i [class]="sortIcon('email')" aria-hidden="true"></i>
                  </button>
                </th>
                <th>{{ 'users.columns.roles' | transloco }}</th>
                <th>{{ 'users.columns.status' | transloco }}</th>
                <th>{{ 'users.columns.mfa' | transloco }}</th>
                @if (deletionQueue()) {
                  <th [attr.aria-sort]="sortState('purgeAt')">
                    <button
                      type="button"
                      class="flex cursor-pointer items-center gap-2"
                      data-testid="sort-purgeAt"
                      (click)="sortBy('purgeAt')"
                    >
                      {{ 'users.columns.purgeAt' | transloco }}
                      <i [class]="sortIcon('purgeAt')" aria-hidden="true"></i>
                    </button>
                  </th>
                }
                <th [attr.aria-sort]="sortState('lastLoginAt')">
                  <button
                    type="button"
                    class="flex cursor-pointer items-center gap-2"
                    data-testid="sort-lastLoginAt"
                    (click)="sortBy('lastLoginAt')"
                  >
                    {{ 'users.columns.lastLoginAt' | transloco }}
                    <i [class]="sortIcon('lastLoginAt')" aria-hidden="true"></i>
                  </button>
                </th>
                <th [attr.aria-sort]="sortState('createdAt')">
                  <button
                    type="button"
                    class="flex cursor-pointer items-center gap-2"
                    data-testid="sort-createdAt"
                    (click)="sortBy('createdAt')"
                  >
                    {{ 'users.columns.createdAt' | transloco }}
                    <i [class]="sortIcon('createdAt')" aria-hidden="true"></i>
                  </button>
                </th>
              </tr>
            </ng-template>

            <ng-template #body let-row>
              @let user = asUser(row);
              <tr
                class="cursor-pointer"
                data-testid="user-row"
                (click)="open(user)"
                (keydown.enter)="open(user)"
              >
                <td>
                  <a
                    class="font-medium break-all hover:underline"
                    [routerLink]="[user.id]"
                    (click)="$event.stopPropagation()"
                    >{{ user.email }}</a
                  >
                </td>
                <td data-testid="user-roles">
                  <span class="inline-flex flex-wrap items-center gap-1">
                    @for (role of user.roles; track role) {
                      <span class="text-sm">{{ roleLabel(role) | transloco }}</span>
                      @if (!$last) {
                        <span class="text-muted-color" aria-hidden="true">·</span>
                      }
                    } @empty {
                      <span class="text-muted-color">—</span>
                    }
                    @if (user.adminLevel; as level) {
                      <app-level-badge [level]="level" />
                    }
                  </span>
                </td>
                <td><app-user-badges [user]="user" /></td>
                <td data-testid="user-mfa">
                  @if (user.twoFactorEnabled) {
                    <i
                      class="pi pi-shield text-green-600"
                      [title]="'users.mfaOn' | transloco"
                      aria-hidden="true"
                    ></i>
                    <span class="sr-only">{{ 'users.mfaOn' | transloco }}</span>
                  } @else {
                    <span class="text-muted-color">—</span>
                  }
                </td>
                @if (deletionQueue()) {
                  <td class="whitespace-nowrap" data-testid="user-purge">
                    {{ user.purgeAt | localDate: lang() }}
                  </td>
                }
                <td class="whitespace-nowrap" data-testid="user-last-login">
                  @if (user.lastLoginAt) {
                    {{ user.lastLoginAt | localDate: lang() }}
                  } @else {
                    <span class="text-muted-color">{{ 'users.neverSignedIn' | transloco }}</span>
                  }
                </td>
                <td class="whitespace-nowrap">{{ user.createdAt | localDate: lang() }}</td>
              </tr>
            </ng-template>

            <ng-template #emptymessage>
              <tr>
                <td
                  [attr.colspan]="deletionQueue() ? 7 : 6"
                  class="py-8 text-center"
                  data-testid="users-empty"
                >
                  @if (page.total > 0) {
                    <p class="mb-2">{{ 'users.emptyPage' | transloco }}</p>
                    <button pButton type="button" [outlined]="true" (click)="goToPage(1)">
                      {{ 'users.firstPage' | transloco }}
                    </button>
                  } @else if (deletionQueue()) {
                    <p>{{ 'users.emptyDeletion' | transloco }}</p>
                  } @else if (filtered()) {
                    <p class="mb-2">{{ 'users.emptyFiltered' | transloco }}</p>
                    <button pButton type="button" [outlined]="true" (click)="resetFilters()">
                      {{ 'users.reset' | transloco }}
                    </button>
                  } @else {
                    <p>{{ 'users.empty' | transloco }}</p>
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
            data-testid="users-paginator"
            (onPageChange)="onPage($event)"
          />
        }
      } @else if (!pageError()) {
        <div class="flex flex-col gap-3" data-testid="users-skeleton" aria-busy="true">
          @for (i of skeletonRows; track i) {
            <p-skeleton height="2.5rem" />
          }
        </div>
      }
    </section>
  `,
})
export class UsersListPage {
  private readonly api = inject(AdminUsersApi);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly lang = inject(LanguageService).current;

  /** The screen as the URL describes it. */
  protected readonly query = toSignal(this.route.queryParamMap.pipe(map(parseUsersQuery)), {
    requireSync: true,
  });

  private readonly pageResource = rxResource({
    params: () => toUserListParams(this.query()),
    stream: ({ params }) => this.api.list(params),
  });

  /** The page last received; kept while the next one loads, so the table does not blink. */
  protected readonly page = linkedSignal<AdminUserPage | undefined, AdminUserPage | undefined>({
    source: () => (this.pageResource.hasValue() ? this.pageResource.value() : undefined),
    computation: (next, previous) => next ?? previous?.value,
  });

  protected readonly loading = computed(() => this.pageResource.isLoading());
  protected readonly filtered = computed(() => hasUserFilters(this.query()));
  protected readonly deletionQueue = computed(() => isDeletionQueue(this.query()));
  protected readonly shortSearch = computed(() => searchTooShort(this.query()));

  protected readonly roles = [...USER_ROLES];
  protected readonly statuses = [...USER_STATUSES];
  protected readonly pageSizes = [...USER_PAGE_SIZES];
  protected readonly searchMin = USER_SEARCH_MIN;
  protected readonly searchMax = USER_SEARCH_MAX;
  protected readonly skeletonRows = SKELETON_ROWS;

  /** What the search box shows; keeps a trailing space being typed (see the schools list). */
  protected readonly searchText = linkedSignal<string, string>({
    source: () => this.query().search,
    computation: (search, previous) =>
      previous && previous.value.trim() === search ? previous.value : search,
  });

  /** Translation key of the page's error, if any; a stale page stays visible under it. */
  protected readonly pageError = computed(() => {
    const error = this.pageResource.error();
    return error ? errorKey(ApiError.from(error)) : null;
  });

  private readonly searchInput = new Subject<string>();

  constructor() {
    // A hand-edited or stale link (unknown status, page -5): show the cleaned screen and say so in
    // the address bar too, quietly, without a history entry.
    this.route.queryParamMap.pipe(takeUntilDestroyed(inject(DestroyRef))).subscribe((params) => {
      const cleaned = cleanedUsersParams(params);
      if (cleaned) {
        void this.router.navigate([], {
          relativeTo: this.route,
          queryParams: cleaned,
          queryParamsHandling: 'merge',
          replaceUrl: true,
        });
      }
    });
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
          this.navigate(withUserFilter(this.query(), { search }), true);
      });
  }

  protected reload(): void {
    this.pageResource.reload();
  }

  protected onSearchInput(event: Event): void {
    const text = (event.target as HTMLInputElement).value;
    this.searchText.set(text);
    this.searchInput.next(text);
  }

  protected setRole(role: UserRole | null): void {
    this.navigate(withUserFilter(this.query(), { role: role ?? null }));
  }

  protected setStatus(status: UserStatus | null): void {
    this.navigate(withUserFilter(this.query(), { status: status ?? null }));
  }

  /** The preset on and off; leaving it keeps the search and the role, drops the status. */
  protected toggleDeletionQueue(): void {
    const { search, role, size } = this.query();
    this.navigate(
      this.deletionQueue()
        ? { ...DEFAULT_USERS_QUERY, search, role, size }
        : { ...DELETION_QUEUE_QUERY, search, role, size },
    );
  }

  protected resetFilters(): void {
    const { sort, size } = this.query();
    this.navigate(withUserFilter({ ...DEFAULT_USERS_QUERY, sort, size }, {}));
  }

  protected sortBy(column: UserSortableColumn): void {
    this.navigate({ ...this.query(), sort: nextUserSort(this.query().sort, column), page: 1 });
  }

  protected sortState(column: UserSortableColumn) {
    return userAriaSort(this.query().sort, column);
  }

  protected sortIcon(column: UserSortableColumn): string {
    const state = userAriaSort(this.query().sort, column);
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

  protected open(user: AdminUserListItem): void {
    void this.router.navigate([user.id], { relativeTo: this.route });
  }

  protected readonly roleLabel = roleKey;

  /** p-table wants a mutable array; the page is never changed through it. */
  protected rows(page: AdminUserPage): AdminUserListItem[] {
    return page.items as AdminUserListItem[];
  }

  /** p-table's row context is untyped; the rows are always this page's items. */
  protected asUser(row: unknown): AdminUserListItem {
    return row as AdminUserListItem;
  }

  private navigate(query: UsersQuery, replaceUrl = false): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: toUsersQueryParams(query),
      replaceUrl,
    });
  }
}

function errorKey(error: ApiError): string {
  if (error.isNetworkError) return 'users.errors.network';
  if (error.status === 403) return 'users.errors.forbidden';
  return 'users.errors.generic';
}
