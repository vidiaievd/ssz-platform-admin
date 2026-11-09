import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Skeleton } from 'primeng/skeleton';
import { TableModule } from 'primeng/table';
import { Tag } from 'primeng/tag';
import { AdminSchoolDetailCountsDto } from '../../../api/organization/models/admin-school-detail-counts-dto';
import { AdminSchoolGroupDto } from '../../../api/organization/models/admin-school-group-dto';
import { LanguageService } from '../../../core/i18n/language.service';
import { LocalDatePipe } from '../../../shared/local-date.pipe';
import { SchoolCardData } from './school-card.data';
import { CourseSummary, SchoolCoursesData } from './school-courses.data';
import { schoolTabLink } from './school-tabs';
import { toMembersQueryParams } from './members-query';

type CountKey = keyof AdminSchoolDetailCountsDto;

/** Order of the people tiles; a tutor's workspace has no teacher or staff rows (only the owner). */
const COUNT_KEYS: readonly CountKey[] = [
  'students',
  'archivedStudents',
  'teachers',
  'staff',
  'pendingApplications',
  'pendingInvitations',
];
const NOT_IN_SOLO: ReadonlySet<CountKey> = new Set(['teachers', 'staff']);

/** Counts that open the "Members" tab filtered to the people they count. */
const MEMBER_FILTERS: Partial<Record<CountKey, Record<string, unknown>>> = {
  students: toMembersQueryParams({ role: 'student', status: 'active' }),
  archivedStudents: toMembersQueryParams({ role: 'student', status: 'archived' }),
  teachers: toMembersQueryParams({ role: 'teacher' }),
  staff: toMembersQueryParams({ role: 'staff' }),
};

const GROUP_STATUS_SEVERITY = {
  draft: 'secondary',
  active: 'success',
  archived: 'warn',
} as const;

/**
 * Overview tab of the school card (plan 90, phase 3, step 7) — read only: details, contacts,
 * the owner, people counts, groups and courses, all from organization's card read once by the
 * card page. Course titles are a side read from content: on failure the ids stay with a retry.
 */
@Component({
  selector: 'app-school-overview-tab',
  providers: [SchoolCoursesData],
  imports: [RouterLink, TranslocoPipe, Skeleton, TableModule, Tag, LocalDatePipe],
  template: `
    @if (data.school(); as school) {
      <div class="grid gap-4 lg:grid-cols-3" data-testid="school-overview">
        <section
          class="border-border flex flex-col gap-3 rounded-md border p-4"
          data-testid="overview-details"
        >
          <h2 class="text-base font-semibold">{{ 'schools.overview.details' | transloco }}</h2>
          @if (school.description) {
            <p class="text-sm whitespace-pre-line" data-testid="overview-description">
              {{ school.description }}
            </p>
          }
          <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt class="text-muted-color">{{ 'schools.overview.format' | transloco }}</dt>
            <dd data-testid="overview-format">
              {{ 'schools.overview.type.' + school.type | transloco }}
            </dd>
            <dt class="text-muted-color">{{ 'schools.columns.createdAt' | transloco }}</dt>
            <dd data-testid="overview-created">{{ school.createdAt | localDate: lang() }}</dd>
            <dt class="text-muted-color">{{ 'schools.overview.updatedAt' | transloco }}</dt>
            <dd>{{ school.updatedAt | localDate: lang() }}</dd>
            <dt class="text-muted-color">ID</dt>
            <dd class="font-mono text-xs break-all">{{ school.id }}</dd>
          </dl>
        </section>

        <section
          class="border-border flex flex-col gap-3 rounded-md border p-4"
          data-testid="overview-contacts"
        >
          <h2 class="text-base font-semibold">{{ 'schools.overview.contacts' | transloco }}</h2>
          @if (school.contacts.email || school.contacts.website || school.contacts.city) {
            <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              @if (school.contacts.email; as email) {
                <dt class="text-muted-color">{{ 'schools.overview.email' | transloco }}</dt>
                <dd class="break-all">
                  <a
                    class="text-primary hover:underline"
                    [href]="'mailto:' + email"
                    data-testid="contact-email"
                    >{{ email }}</a
                  >
                </dd>
              }
              @if (school.contacts.website; as website) {
                <dt class="text-muted-color">{{ 'schools.overview.website' | transloco }}</dt>
                <dd class="break-all" data-testid="contact-website">
                  @if (websiteHref(website); as href) {
                    <a
                      class="text-primary hover:underline"
                      [href]="href"
                      target="_blank"
                      rel="noopener noreferrer"
                      >{{ website }}</a
                    >
                  } @else {
                    {{ website }}
                  }
                </dd>
              }
              @if (school.contacts.city; as city) {
                <dt class="text-muted-color">{{ 'schools.overview.city' | transloco }}</dt>
                <dd data-testid="contact-city">{{ city }}</dd>
              }
            </dl>
          } @else {
            <p class="text-muted-color text-sm" data-testid="contacts-empty">
              {{ 'schools.overview.noContacts' | transloco }}
            </p>
          }
        </section>

        <section
          class="border-border flex flex-col gap-3 rounded-md border p-4"
          data-testid="overview-owner"
        >
          <h2 class="text-base font-semibold">{{ 'schools.columns.owner' | transloco }}</h2>
          <div class="flex flex-col gap-1 text-sm">
            <span class="font-medium" data-testid="owner-name">
              {{ school.owner.name ?? ('schools.overview.ownerNoName' | transloco) }}
            </span>
            @if (school.owner.email; as email) {
              <a
                class="text-primary break-all hover:underline"
                [href]="'mailto:' + email"
                data-testid="owner-email"
                >{{ email }}</a
              >
            }
            <span class="text-muted-color font-mono text-xs break-all">{{
              school.owner.userId
            }}</span>
          </div>
          <p class="text-muted-color text-xs">{{ 'schools.overview.ownerHint' | transloco }}</p>
        </section>
      </div>

      <section class="mt-4 flex flex-col gap-3" data-testid="overview-people">
        <h2 class="text-base font-semibold">{{ 'schools.overview.people' | transloco }}</h2>
        <dl class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          @for (key of countKeys; track key) {
            <div
              class="border-border flex flex-col gap-1 rounded-md border px-3 py-2"
              [attr.data-testid]="'count-' + key"
            >
              <dt class="text-muted-color text-xs">
                {{ 'schools.overview.counts.' + key | transloco }}
              </dt>
              <dd class="text-xl font-semibold tabular-nums">
                @if (solo() && notInSolo.has(key)) {
                  —
                } @else if (memberFilters[key]; as filters) {
                  <a
                    class="hover:text-primary hover:underline"
                    [routerLink]="membersLink()"
                    [queryParams]="filters"
                    [attr.data-testid]="'count-link-' + key"
                    >{{ school.counts[key] }}</a
                  >
                } @else {
                  {{ school.counts[key] }}
                }
              </dd>
            </div>
          }
        </dl>
      </section>

      <section class="mt-4 flex flex-col gap-3" data-testid="overview-groups">
        <h2 class="text-base font-semibold">
          {{ 'schools.overview.groups' | transloco }}
          <span class="text-muted-color font-normal">{{ school.groups.length }}</span>
        </h2>
        @if (school.groups.length === 0) {
          <p class="text-muted-color text-sm" data-testid="groups-empty">
            {{ 'schools.overview.noGroups' | transloco }}
          </p>
        } @else {
          <div class="overflow-x-auto">
            <p-table
              [value]="school.groups"
              dataKey="id"
              size="small"
              [tableStyle]="{ 'min-width': '40rem' }"
            >
              <ng-template #header>
                <tr>
                  <th>{{ 'schools.columns.name' | transloco }}</th>
                  <th>{{ 'schools.overview.level' | transloco }}</th>
                  <th>{{ 'schools.columns.status' | transloco }}</th>
                  <th class="text-right">{{ 'schools.columns.students' | transloco }}</th>
                  <th>{{ 'schools.overview.course' | transloco }}</th>
                </tr>
              </ng-template>
              <ng-template #body let-row>
                @let group = asGroup(row);
                <tr data-testid="group-row">
                  <td>
                    {{ group.name }}
                    @if (group.isDefault) {
                      <p-tag
                        class="ml-1"
                        severity="secondary"
                        [value]="'schools.overview.defaultGroup' | transloco"
                        data-testid="group-default"
                      />
                    }
                  </td>
                  <td>{{ group.level ?? '—' }}</td>
                  <td>
                    <p-tag
                      [severity]="groupStatusSeverity[group.status]"
                      [value]="'schools.overview.groupStatus.' + group.status | transloco"
                    />
                  </td>
                  <td class="text-right tabular-nums">{{ group.students }}</td>
                  <td data-testid="group-course">
                    @if (group.courseId; as courseId) {
                      @switch (courses.titles().kind) {
                        @case ('loading') {
                          <p-skeleton width="8rem" />
                        }
                        @default {
                          {{ courseTitle(courseId)?.title ?? shortId(courseId) }}
                        }
                      }
                    } @else {
                      —
                    }
                  </td>
                </tr>
              </ng-template>
            </p-table>
          </div>
        }
      </section>

      <section class="mt-4 flex flex-col gap-3" data-testid="overview-courses">
        <h2 class="text-base font-semibold">
          {{ 'schools.overview.courses' | transloco }}
          <span class="text-muted-color font-normal">{{ courseIds().length }}</span>
        </h2>
        @if (courses.titles().kind === 'error') {
          <p class="flex items-center gap-2 text-sm" role="alert" data-testid="courses-failed">
            <i class="pi pi-exclamation-triangle text-red-500" aria-hidden="true"></i>
            {{ 'schools.overview.coursesFailed' | transloco }}
            <button
              type="button"
              class="text-primary underline"
              data-testid="courses-retry"
              (click)="courses.reload()"
            >
              {{ 'schools.retry' | transloco }}
            </button>
          </p>
        }
        @if (courseIds().length === 0) {
          <p class="text-muted-color text-sm" data-testid="courses-empty">
            {{ 'schools.overview.noCourses' | transloco }}
          </p>
        } @else {
          <ul class="flex flex-col gap-1 text-sm">
            @for (id of courseIds(); track id) {
              <li class="flex flex-wrap items-center gap-2" data-testid="course-row">
                @switch (courses.titles().kind) {
                  @case ('loading') {
                    <p-skeleton width="12rem" />
                  }
                  @default {
                    @if (courseTitle(id); as course) {
                      <span class="font-medium">{{ course.title }}</span>
                      @if (course.level) {
                        <span class="text-muted-color text-xs">{{ course.level }}</span>
                      }
                      @if (course.archived) {
                        <p-tag
                          severity="warn"
                          [value]="'schools.overview.courseArchived' | transloco"
                        />
                      }
                    } @else if (courseMissing(id)) {
                      <span class="text-muted-color">{{
                        'schools.overview.courseUnknown' | transloco
                      }}</span>
                    }
                  }
                }
                <span class="text-muted-color font-mono text-xs">{{ id }}</span>
              </li>
            }
          </ul>
        }
      </section>
    }
  `,
})
export class SchoolOverviewTab {
  protected readonly data = inject(SchoolCardData);
  protected readonly courses = inject(SchoolCoursesData);
  protected readonly lang = inject(LanguageService).current;
  protected readonly countKeys = COUNT_KEYS;
  protected readonly notInSolo = NOT_IN_SOLO;
  protected readonly memberFilters = MEMBER_FILTERS;
  protected readonly membersLink = computed(() =>
    schoolTabLink(this.data.schoolId() ?? '', 'members'),
  );
  protected readonly groupStatusSeverity = GROUP_STATUS_SEVERITY;

  protected readonly solo = computed(() => this.data.school()?.kind === 'SOLO');
  protected readonly courseIds = computed(() => this.courses.ids() ?? []);

  protected courseTitle(id: string): CourseSummary | null {
    const titles = this.courses.titles();
    return titles.kind === 'ready' ? (titles.value.get(id) ?? null) : null;
  }

  /** Content answered that it does not know (or hides) the course; unread ids are not "missing". */
  protected courseMissing(id: string): boolean {
    const titles = this.courses.titles();
    return titles.kind === 'ready' && titles.value.has(id) && titles.value.get(id) === null;
  }

  protected shortId(id: string): string {
    return id.slice(0, 8);
  }

  /** A link only for http(s); a bare domain gets https. Anything else is shown as text. */
  protected websiteHref(website: string): string | null {
    const value = website.trim();
    if (/^https?:\/\//i.test(value)) return value;
    if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(value)) return `https://${value}`;
    return null;
  }

  /** p-table's row context is untyped; the rows are always the school's groups. */
  protected asGroup(row: unknown): AdminSchoolGroupDto {
    return row as AdminSchoolGroupDto;
  }
}
