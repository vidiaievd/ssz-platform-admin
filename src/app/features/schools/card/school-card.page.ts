import { Component, computed, effect, inject, input } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { ButtonDirective } from 'primeng/button';
import { Skeleton } from 'primeng/skeleton';
import { Tag } from 'primeng/tag';
import { ApiError } from '../../../core/auth/api-error';
import { LanguageService } from '../../../core/i18n/language.service';
import { LocalDatePipe } from '../../../shared/local-date.pipe';
import { seatLevel, seatLevelClass, seatsText } from '../seats';
import { SchoolCardData } from './school-card.data';
import { SCHOOL_TABS, SchoolTab, schoolTabLink } from './school-tabs';

const STATUS_SEVERITY = { active: 'success', inactive: 'warn', deleted: 'danger' } as const;

/**
 * `/schools/:schoolId[/:tab]` — the school card (plan 90, phase 3): a header with the name, kind,
 * status and current plan, and the tabs as links in the URL. The tabs render in the outlet below
 * and read the school from `SchoolCardData`, provided here.
 */
@Component({
  selector: 'app-school-card-page',
  providers: [SchoolCardData],
  imports: [
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    TranslocoPipe,
    ButtonDirective,
    Skeleton,
    Tag,
    LocalDatePipe,
  ],
  template: `
    <section class="flex flex-col gap-4">
      <a class="text-primary flex w-fit items-center gap-1 text-sm" routerLink="/schools">
        <i class="pi pi-arrow-left" aria-hidden="true"></i>
        {{ 'schools.backToList' | transloco }}
      </a>

      @if (data.notFound()) {
        <div class="flex max-w-2xl flex-col gap-2" data-testid="school-not-found">
          <h1 class="text-2xl font-semibold" data-testid="page-title">
            {{ 'schools.card.notFound' | transloco }}
          </h1>
          <p class="text-muted-color">{{ 'schools.card.notFoundText' | transloco }}</p>
          <p class="text-muted-color font-mono text-sm">{{ schoolId() }}</p>
        </div>
      } @else if (data.school(); as school) {
        <header class="flex flex-col gap-2" data-testid="school-header">
          <div class="flex flex-wrap items-center gap-2">
            <h1 class="text-2xl font-semibold" data-testid="page-title">{{ school.name }}</h1>
            <p-tag
              severity="secondary"
              [value]="'schools.kind.' + school.kind | transloco"
              data-testid="school-kind"
            />
            <p-tag
              [severity]="statusSeverity[school.status]"
              [value]="'schools.status.' + school.status | transloco"
              data-testid="school-status"
            />
          </div>
          <div class="text-muted-color flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span class="font-mono" data-testid="school-slug">{{ school.slug }}</span>
            @if (school.deletedAt) {
              <span data-testid="school-deleted-at">
                {{
                  'schools.card.deletedAt'
                    | transloco: { date: (school.deletedAt | localDate: lang()) }
                }}
              </span>
            }
            <span class="flex items-center gap-1" data-testid="school-seats">
              {{ 'schools.columns.seats' | transloco }}:
              <a
                class="hover:underline"
                [class]="seatClass()"
                [attr.data-level]="seatLevelOf()"
                [routerLink]="planLink()"
                data-testid="school-seats-value"
                >{{ seatsLabel() }}</a
              >
            </span>
            <span class="flex items-center gap-1" data-testid="school-plan">
              {{ 'schools.columns.plan' | transloco }}:
              @switch (data.plan().kind) {
                @case ('loading') {
                  <p-skeleton width="6rem" />
                }
                @case ('error') {
                  —
                  <button
                    type="button"
                    class="text-primary underline"
                    data-testid="school-plan-retry"
                    (click)="data.reloadPlan()"
                  >
                    {{ 'schools.retry' | transloco }}
                  </button>
                }
                @default {
                  @if (planOf(); as plan) {
                    <a class="text-fg hover:underline" [routerLink]="planLink()">
                      {{ plan.name }} <span class="text-xs">v{{ plan.version }}</span>
                    </a>
                    @if (trial()) {
                      <p-tag severity="info" [value]="'schools.trial' | transloco" />
                    }
                  } @else {
                    —
                  }
                }
              }
            </span>
          </div>
        </header>

        <nav
          class="border-border flex gap-1 overflow-x-auto border-b"
          [attr.aria-label]="'schools.card.tabsLabel' | transloco"
          data-testid="school-tabs"
        >
          @for (tab of tabs; track tab) {
            <a
              class="text-muted-color hover:text-fg -mb-px border-b-2 border-transparent px-3 py-2 text-sm font-medium whitespace-nowrap"
              routerLinkActive="!border-primary !text-fg"
              ariaCurrentWhenActive="page"
              [routerLinkActiveOptions]="{ exact: true }"
              [routerLink]="tabLink(tab)"
              [attr.data-testid]="'tab-' + tab"
            >
              {{ 'schools.card.tabs.' + tab | transloco }}
            </a>
          }
        </nav>

        <router-outlet />
      } @else if (data.error(); as error) {
        <div
          role="alert"
          class="flex max-w-2xl flex-wrap items-center gap-3 rounded-md border border-red-300 px-3 py-2 text-sm dark:border-red-800"
          data-testid="school-error"
        >
          <i class="pi pi-exclamation-triangle text-red-500" aria-hidden="true"></i>
          <span>{{ errorKey(error) | transloco }}</span>
          <button pButton type="button" size="small" [outlined]="true" (click)="data.reload()">
            {{ 'schools.retry' | transloco }}
          </button>
        </div>
      } @else {
        <div class="flex flex-col gap-3" data-testid="school-skeleton" aria-busy="true">
          <p-skeleton width="16rem" height="2rem" />
          <p-skeleton width="24rem" height="1rem" />
          <p-skeleton height="2.5rem" />
        </div>
      }
    </section>
  `,
})
export class SchoolCardPage {
  readonly schoolId = input.required<string>();

  protected readonly data = inject(SchoolCardData);
  protected readonly lang = inject(LanguageService).current;
  protected readonly tabs = SCHOOL_TABS;
  protected readonly statusSeverity = STATUS_SEVERITY;

  protected readonly planOf = computed(() => {
    const plan = this.data.plan();
    return plan.kind === 'ready' ? (plan.value?.plan ?? null) : null;
  });
  protected readonly trial = computed(() => {
    const plan = this.data.plan();
    return plan.kind === 'ready' && plan.value?.subscription?.status === 'trial';
  });
  protected readonly seatLevelOf = computed(() => {
    const seats = this.data.school()?.seats;
    return seats ? seatLevel(seats.used, seats.limit) : 'none';
  });
  protected readonly seatClass = computed(() => seatLevelClass(this.seatLevelOf()));
  protected readonly seatsLabel = computed(() => {
    const seats = this.data.school()?.seats;
    return seats ? seatsText(seats.used, seats.limit) : '—';
  });
  protected readonly planLink = computed(() => schoolTabLink(this.schoolId(), 'plan'));

  constructor() {
    effect(() => this.data.schoolId.set(this.schoolId()));
  }

  protected tabLink(tab: SchoolTab): string[] {
    return schoolTabLink(this.schoolId(), tab);
  }

  protected errorKey(error: ApiError): string {
    if (error.isNetworkError) return 'schools.errors.network';
    if (error.status === 403) return 'schools.card.errors.forbidden';
    return 'schools.card.errors.generic';
  }
}
