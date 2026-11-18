import { Component, computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Skeleton } from 'primeng/skeleton';
import { Tag } from 'primeng/tag';
import { adminUsersSchools } from '../../../api/organization/functions';
import { AdminMemberGroupDto } from '../../../api/organization/models/admin-member-group-dto';
import { OrganizationApi } from '../../../api/organization/organization-api';
import { LanguageService } from '../../../core/i18n/language.service';
import { LocalDatePipe } from '../../../shared/local-date.pipe';
import { stateOf } from '../../schools/card/plan/school-plan.data';
import { schoolTabLink } from '../../schools/card/school-tabs';
import { STATUS_SEVERITY } from '../../schools/school-lifecycle';
import { UserCardData } from './user-card.data';

/**
 * "Schools" tab of the user card (plan 90, phase 6, step 7): what the account owns (schools and
 * SOLO workspaces, with the groups the owner teaches) and its roster rows in other schools, from
 * organization `admin/users/:userId/schools`. Closed schools are listed, purged ones are not.
 * Each school links to its card. Organization does not know users: an unknown one has two empty
 * lists, never a 404.
 */
@Component({
  selector: 'app-user-schools-tab',
  imports: [RouterLink, TranslocoPipe, Skeleton, Tag, LocalDatePipe],
  template: `
    @switch (schools().kind) {
      @case ('loading') {
        <p-skeleton height="8rem" />
      }
      @case ('error') {
        <p class="text-sm" role="alert" data-testid="user-schools-failed">
          {{ 'users.card.schools.failed' | transloco }} ·
          <button type="button" class="text-primary underline" (click)="resource.reload()">
            {{ 'users.retry' | transloco }}
          </button>
        </p>
      }
      @default {
        @if (value(); as v) {
          <div class="flex flex-col gap-4" data-testid="user-schools">
            <section
              class="border-border flex flex-col gap-3 rounded-md border p-4"
              data-testid="user-owned"
            >
              <h2 class="text-base font-semibold">{{ 'users.card.schools.owned' | transloco }}</h2>
              @if (v.owned.length === 0) {
                <p class="text-muted-color text-sm" data-testid="user-owned-empty">
                  {{ 'users.card.schools.ownedEmpty' | transloco }}
                </p>
              } @else {
                <ul class="flex flex-col">
                  @for (school of v.owned; track school.id) {
                    <li
                      class="border-border flex flex-wrap items-center gap-x-3 gap-y-1 border-t py-2 text-sm first:border-t-0"
                      data-testid="owned-row"
                    >
                      <a
                        class="text-primary font-medium hover:underline"
                        [routerLink]="schoolLink(school.id)"
                        data-testid="owned-link"
                        >{{ school.name }}</a
                      >
                      <span class="text-muted-color font-mono text-xs">{{ school.slug }}</span>
                      <p-tag
                        severity="secondary"
                        [value]="'schools.kind.' + school.kind | transloco"
                      />
                      <p-tag
                        [severity]="statusSeverity[school.status]"
                        [value]="'schools.status.' + school.status | transloco"
                      />
                      @if (groupsText(school.groups); as groups) {
                        <span class="text-muted-color text-xs" data-testid="owned-groups">
                          {{ 'users.card.schools.teaches' | transloco: { groups } }}
                        </span>
                      }
                      <span class="text-muted-color ml-auto text-xs">
                        {{ school.createdAt | localDate: lang() }}
                      </span>
                    </li>
                  }
                </ul>
              }
            </section>

            <section
              class="border-border flex flex-col gap-3 rounded-md border p-4"
              data-testid="user-memberships"
            >
              <h2 class="text-base font-semibold">
                {{ 'users.card.schools.memberships' | transloco }}
              </h2>
              @if (v.memberships.length === 0) {
                <p class="text-muted-color text-sm" data-testid="user-memberships-empty">
                  {{ 'users.card.schools.membershipsEmpty' | transloco }}
                </p>
              } @else {
                <ul class="flex flex-col">
                  @for (m of v.memberships; track m.school.id + m.rosterRole) {
                    <li
                      class="border-border flex flex-wrap items-center gap-x-3 gap-y-1 border-t py-2 text-sm first:border-t-0"
                      data-testid="membership-row"
                    >
                      <a
                        class="text-primary font-medium hover:underline"
                        [routerLink]="schoolLink(m.school.id)"
                        data-testid="membership-link"
                        >{{ m.school.name }}</a
                      >
                      @if (m.school.status !== 'active') {
                        <p-tag
                          [severity]="statusSeverity[m.school.status]"
                          [value]="'schools.status.' + m.school.status | transloco"
                        />
                      }
                      <span data-testid="membership-role">
                        {{ 'schools.members.rosterRoles.' + m.rosterRole | transloco }}
                      </span>
                      @if (m.status === 'archived') {
                        <p-tag
                          severity="warn"
                          [value]="'schools.members.statuses.archived' | transloco"
                        />
                      }
                      @if (groupsText(m.groups); as groups) {
                        <span class="text-muted-color text-xs" data-testid="membership-groups">
                          {{ groups }}
                        </span>
                      }
                      <span class="text-muted-color ml-auto text-xs">
                        {{ 'schools.members.joinedAt' | transloco }}
                        {{ m.joinedAt | localDate: lang() }}
                      </span>
                    </li>
                  }
                </ul>
              }
            </section>
          </div>
        }
      }
    }
  `,
})
export class UserSchoolsTab {
  private readonly organization = inject(OrganizationApi);
  private readonly card = inject(UserCardData);
  protected readonly lang = inject(LanguageService).current;
  protected readonly statusSeverity = STATUS_SEVERITY;

  protected readonly resource = rxResource({
    params: () => this.card.userId(),
    stream: ({ params: userId }) => this.organization.invoke(adminUsersSchools, { userId }),
  });

  protected readonly schools = computed(() => stateOf(this.resource));
  protected readonly value = computed(() => {
    const s = this.schools();
    return s.kind === 'ready' ? s.value : null;
  });

  protected schoolLink(schoolId: string): string[] {
    return schoolTabLink(schoolId);
  }

  /** Named groups by name; a SOLO workspace's hidden default group is not one to show. */
  protected groupsText(groups: readonly AdminMemberGroupDto[]): string {
    return groups
      .filter((g) => !g.isDefault)
      .map((g) => g.name)
      .join(', ');
  }
}
