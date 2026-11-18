import { Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { ButtonDirective } from 'primeng/button';
import { Paginator, PaginatorState } from 'primeng/paginator';
import { Select } from 'primeng/select';
import { Skeleton } from 'primeng/skeleton';
import { TableModule } from 'primeng/table';
import { Tag } from 'primeng/tag';
import { AdminMemberDto } from '../../../api/organization/models/admin-member-dto';
import { AdminMemberGroupDto } from '../../../api/organization/models/admin-member-group-dto';
import { ApiError } from '../../../core/auth/api-error';
import { LanguageService } from '../../../core/i18n/language.service';
import { LocalDatePipe } from '../../../shared/local-date.pipe';
import {
  DEFAULT_MEMBERS_QUERY,
  MEMBER_PAGE_SIZES,
  MEMBER_ROLES,
  MEMBER_STATUSES,
  MembersQuery,
  hasMemberFilters,
  toMembersQueryParams,
} from './members-query';
import { SchoolCardData } from './school-card.data';
import { SchoolMembersData } from './school-members.data';

const SKELETON_ROWS = Array.from({ length: 6 }, (_, i) => i);
const STATUS_SEVERITY = { active: 'success', archived: 'secondary' } as const;

/**
 * "Members" tab of the school card (plan 90, phase 3, step 8) — the roster, read only: name,
 * role, groups today, status, joined. No email and no learning activity (§1). Filters and page
 * live in the URL. The owner is not a roster row: it stands on its own line above the table
 * (unfiltered first page only).
 */
@Component({
  selector: 'app-school-members-tab',
  providers: [SchoolMembersData],
  imports: [
    FormsModule,
    TranslocoPipe,
    ButtonDirective,
    Paginator,
    Select,
    Skeleton,
    TableModule,
    Tag,
    LocalDatePipe,
  ],
  template: `
    <div class="flex flex-col gap-4" data-testid="school-members">
      <div class="flex flex-wrap items-center gap-2" role="search">
        <p-select
          class="w-full sm:w-44"
          [options]="roles"
          [ngModel]="query().role"
          (ngModelChange)="setFilter({ role: $event ?? null })"
          [showClear]="true"
          [placeholder]="'schools.members.allRoles' | transloco"
          [ariaLabel]="'schools.members.role' | transloco"
          data-testid="members-role"
        >
          <ng-template #item let-role>{{
            'schools.members.roles.' + role | transloco
          }}</ng-template>
          <ng-template #selectedItem let-role>
            {{ 'schools.members.roles.' + role | transloco }}
          </ng-template>
        </p-select>
        <p-select
          class="w-full sm:w-44"
          [options]="statuses"
          [ngModel]="query().status"
          (ngModelChange)="setFilter({ status: $event ?? null })"
          [showClear]="true"
          [placeholder]="'schools.members.allStatuses' | transloco"
          [ariaLabel]="'schools.columns.status' | transloco"
          data-testid="members-status"
        >
          <ng-template #item let-status>
            {{ 'schools.members.statuses.' + status | transloco }}
          </ng-template>
          <ng-template #selectedItem let-status>
            {{ 'schools.members.statuses.' + status | transloco }}
          </ng-template>
        </p-select>
        @if (groupOptions().length > 0 || query().group) {
          <p-select
            class="w-full sm:w-56"
            [options]="groupOptions()"
            optionLabel="name"
            optionValue="id"
            [ngModel]="query().group"
            (ngModelChange)="setFilter({ group: $event ?? null })"
            [showClear]="true"
            [filter]="groupOptions().length > 8"
            [placeholder]="'schools.members.allGroups' | transloco"
            [ariaLabel]="'schools.members.group' | transloco"
            data-testid="members-group"
          />
        }
        @if (filtered()) {
          <button
            pButton
            type="button"
            [text]="true"
            severity="secondary"
            data-testid="members-reset"
            (click)="resetFilters()"
          >
            <i class="pi pi-filter-slash" aria-hidden="true"></i>
            {{ 'schools.reset' | transloco }}
          </button>
        }
        @if (data.page(); as page) {
          <span class="text-muted-color ml-auto text-sm" data-testid="members-total">
            {{ 'schools.total' | transloco: { count: page.total } }}
          </span>
        }
      </div>

      @if (pageError(); as error) {
        <div
          role="alert"
          class="flex flex-wrap items-center gap-3 rounded-md border border-red-300 px-3 py-2 text-sm dark:border-red-800"
          data-testid="members-error"
        >
          <i class="pi pi-exclamation-triangle text-red-500" aria-hidden="true"></i>
          <span>{{ error | transloco }}</span>
          <button pButton type="button" size="small" [outlined]="true" (click)="data.reload()">
            {{ 'schools.retry' | transloco }}
          </button>
        </div>
      }

      @if (data.names().kind === 'error') {
        <p class="text-muted-color text-sm" data-testid="members-names-failed">
          {{ 'schools.members.namesFailed' | transloco }} ·
          <button type="button" class="text-primary underline" (click)="data.reloadNames()">
            {{ 'schools.retry' | transloco }}
          </button>
        </p>
      }

      @if (showOwner() && card.school(); as school) {
        <div
          class="border-border bg-emphasis flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border px-3 py-2 text-sm"
          data-testid="members-owner"
        >
          <span class="font-medium">{{ school.owner.name ?? '—' }}</span>
          <p-tag severity="info" [value]="'schools.members.owner' | transloco" />
          <span class="text-muted-color text-xs">{{
            'schools.members.ownerHint' | transloco
          }}</span>
        </div>
      }

      @if (data.page(); as page) {
        <div class="overflow-x-auto">
          <p-table
            [value]="page.items"
            [loading]="data.loading()"
            dataKey="userId"
            size="small"
            [tableStyle]="{ 'min-width': '48rem' }"
          >
            <ng-template #header>
              <tr>
                <th>{{ 'schools.columns.name' | transloco }}</th>
                <th>{{ 'schools.members.role' | transloco }}</th>
                <th>{{ 'schools.overview.groups' | transloco }}</th>
                <th>{{ 'schools.columns.status' | transloco }}</th>
                <th>{{ 'schools.members.joinedAt' | transloco }}</th>
              </tr>
            </ng-template>

            <ng-template #body let-row>
              @let member = asMember(row);
              <tr data-testid="member-row">
                <td data-testid="member-name">
                  @if (member.name) {
                    {{ member.name }}
                  } @else {
                    @switch (data.names().kind) {
                      @case ('loading') {
                        <p-skeleton width="8rem" />
                      }
                      @default {
                        {{ profileName(member.userId) ?? '—' }}
                      }
                    }
                  }
                  <div class="text-muted-color font-mono text-xs">{{ member.userId }}</div>
                </td>
                <td data-testid="member-role">
                  {{ 'schools.members.roles.' + member.role | transloco }}
                  @if (member.role === 'staff') {
                    <span class="text-muted-color text-xs">
                      · {{ 'schools.members.rosterRoles.' + member.rosterRole | transloco }}
                    </span>
                  }
                </td>
                <td data-testid="member-groups">
                  <div class="flex flex-wrap gap-1">
                    @for (group of visibleGroups(member); track group.id + group.as) {
                      <button
                        type="button"
                        class="border-border hover:bg-emphasis rounded border px-1.5 py-0.5 text-xs"
                        [attr.aria-pressed]="query().group === group.id"
                        [title]="'schools.members.filterByGroup' | transloco"
                        (click)="setFilter({ group: group.id })"
                      >
                        {{ group.name }}
                        @if (group.as === 'trial' || group.as === 'observer') {
                          <span class="text-muted-color">
                            · {{ 'schools.members.as.' + group.as | transloco }}
                          </span>
                        }
                      </button>
                    } @empty {
                      <span class="text-muted-color">—</span>
                    }
                  </div>
                </td>
                <td>
                  <p-tag
                    [severity]="statusSeverity[member.status]"
                    [value]="'schools.members.statuses.' + member.status | transloco"
                  />
                </td>
                <td class="whitespace-nowrap">{{ member.joinedAt | localDate: lang() }}</td>
              </tr>
            </ng-template>

            <ng-template #emptymessage>
              <tr>
                <td colspan="5" class="py-8 text-center" data-testid="members-empty">
                  @if (page.total > 0) {
                    <p class="mb-2">{{ 'schools.emptyPage' | transloco }}</p>
                    <button pButton type="button" [outlined]="true" (click)="goToPage(1)">
                      {{ 'schools.firstPage' | transloco }}
                    </button>
                  } @else if (filtered()) {
                    <p class="mb-2">{{ 'schools.members.emptyFiltered' | transloco }}</p>
                    <button pButton type="button" [outlined]="true" (click)="resetFilters()">
                      {{ 'schools.reset' | transloco }}
                    </button>
                  } @else {
                    <p>{{ 'schools.members.empty' | transloco }}</p>
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
            data-testid="members-paginator"
            (onPageChange)="onPage($event)"
          />
        }
      } @else if (!pageError()) {
        <div class="flex flex-col gap-3" data-testid="members-skeleton" aria-busy="true">
          @for (i of skeletonRows; track i) {
            <p-skeleton height="2.5rem" />
          }
        </div>
      }
    </div>
  `,
})
export class SchoolMembersTab {
  protected readonly data = inject(SchoolMembersData);
  protected readonly card = inject(SchoolCardData);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly lang = inject(LanguageService).current;

  protected readonly query = this.data.query;
  protected readonly filtered = computed(() => hasMemberFilters(this.query()));
  protected readonly roles = [...MEMBER_ROLES];
  protected readonly statuses = [...MEMBER_STATUSES];
  protected readonly pageSizes = [...MEMBER_PAGE_SIZES];
  protected readonly statusSeverity = STATUS_SEVERITY;
  protected readonly skeletonRows = SKELETON_ROWS;

  /** Groups of the school to filter by; a SOLO's hidden group holds everyone and is left out. */
  protected readonly groupOptions = computed(() =>
    (this.card.school()?.groups ?? [])
      .filter((g) => !g.isDefault)
      .map((g) => ({ id: g.id, name: g.name })),
  );

  protected readonly showOwner = computed(
    () => !this.filtered() && this.query().page === 1 && !this.data.error(),
  );

  protected readonly pageError = computed(() => {
    const error = this.data.error();
    return error ? errorKey(error) : null;
  });

  protected setFilter(change: Partial<Pick<MembersQuery, 'role' | 'status' | 'group'>>): void {
    // A filter change starts again from page 1; the page size stays.
    this.navigate({ ...this.query(), ...change, page: 1 });
  }

  protected resetFilters(): void {
    this.navigate({ ...DEFAULT_MEMBERS_QUERY, size: this.query().size });
  }

  protected onPage(event: PaginatorState): void {
    const { size: current, page: currentPage } = this.query();
    const size = event.rows ?? current;
    const page = size !== current ? 1 : Math.floor((event.first ?? 0) / size) + 1;
    if (size === current && page === currentPage) return;
    this.navigate({ ...this.query(), page, size });
  }

  protected goToPage(page: number): void {
    this.navigate({ ...this.query(), page });
  }

  protected profileName(userId: string): string | undefined {
    const names = this.data.names();
    return names.kind === 'ready' ? names.value.get(userId) : undefined;
  }

  /** The hidden SOLO group is every learner's: not worth a chip. */
  protected visibleGroups(member: AdminMemberDto): AdminMemberGroupDto[] {
    return member.groups.filter((g) => !g.isDefault);
  }

  /** p-table's row context is untyped; the rows are always this page's members. */
  protected asMember(row: unknown): AdminMemberDto {
    return row as AdminMemberDto;
  }

  private navigate(query: MembersQuery): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: toMembersQueryParams(query),
    });
  }
}

function errorKey(error: ApiError): string {
  if (error.isNetworkError) return 'schools.errors.network';
  if (error.status === 403) return 'schools.card.errors.forbidden';
  return 'schools.members.errors.generic';
}
