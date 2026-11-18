import { Component, computed, effect, inject, input } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { ButtonDirective } from 'primeng/button';
import { Skeleton } from 'primeng/skeleton';
import { Tag } from 'primeng/tag';
import { ApiError } from '../../../core/auth/api-error';
import { LevelBadge } from '../../../layout/level-badge';
import { PayerCard } from '../../schools/card/payer-card';
import { UserBadges } from '../user-badges';
import { roleKey } from '../user-roles';
import { UserCardData } from './user-card.data';
import { USER_TABS, UserTab, userTabLink } from './user-tabs';

/**
 * `/users/:userId[/:tab]` — the user card (plan 90, phase 6, step 7): a header with the e-mail,
 * status badges, roles, the admin level and the learner's own plan, and the tabs as links in the
 * URL. The tabs render in the outlet below and read the account from `UserCardData`, provided
 * here (also as the `PayerCard` of the shared plan, AI and journal tabs).
 */
@Component({
  selector: 'app-user-card-page',
  providers: [UserCardData, { provide: PayerCard, useExisting: UserCardData }],
  imports: [
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    TranslocoPipe,
    ButtonDirective,
    Skeleton,
    Tag,
    LevelBadge,
    UserBadges,
  ],
  template: `
    <section class="flex flex-col gap-4">
      <a class="text-primary flex w-fit items-center gap-1 text-sm" routerLink="/users">
        <i class="pi pi-arrow-left" aria-hidden="true"></i>
        {{ 'users.card.backToList' | transloco }}
      </a>

      @if (data.notFound()) {
        <div class="flex max-w-2xl flex-col gap-2" data-testid="user-not-found">
          <h1 class="text-2xl font-semibold" data-testid="page-title">
            {{ 'users.card.notFound' | transloco }}
          </h1>
          <p class="text-muted-color">{{ 'users.card.notFoundText' | transloco }}</p>
          <p class="text-muted-color font-mono text-sm">{{ userId() }}</p>
        </div>
      } @else if (data.user(); as user) {
        <header class="flex flex-col gap-2" data-testid="user-header">
          <div class="flex flex-wrap items-center gap-2">
            <h1 class="text-2xl font-semibold break-all" data-testid="page-title">
              {{ user.email }}
            </h1>
            <app-user-badges [user]="user" />
            @if (user.adminLevel; as level) {
              <app-level-badge [level]="level" />
            }
          </div>
          <div class="text-muted-color flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span class="flex flex-wrap items-center gap-1" data-testid="user-roles">
              @for (role of user.roles; track role) {
                <p-tag severity="secondary" [value]="roleKey(role) | transloco" />
              } @empty {
                {{ 'users.card.noRoles' | transloco }}
              }
            </span>
            <span class="flex items-center gap-1" data-testid="user-plan">
              {{ 'users.card.plan' | transloco }}:
              @switch (data.plan().kind) {
                @case ('loading') {
                  <p-skeleton width="6rem" />
                }
                @case ('error') {
                  —
                  <button
                    type="button"
                    class="text-primary underline"
                    data-testid="user-plan-retry"
                    (click)="data.reloadPlan()"
                  >
                    {{ 'users.retry' | transloco }}
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
          [attr.aria-label]="'users.card.tabsLabel' | transloco"
          data-testid="user-tabs"
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
              {{ 'users.card.tabs.' + tab | transloco }}
            </a>
          }
        </nav>

        <router-outlet />
      } @else if (data.error(); as error) {
        <div
          role="alert"
          class="flex max-w-2xl flex-wrap items-center gap-3 rounded-md border border-red-300 px-3 py-2 text-sm dark:border-red-800"
          data-testid="user-error"
        >
          <i class="pi pi-exclamation-triangle text-red-500" aria-hidden="true"></i>
          <span>{{ errorKey(error) | transloco }}</span>
          <button pButton type="button" size="small" [outlined]="true" (click)="data.reload()">
            {{ 'users.retry' | transloco }}
          </button>
        </div>
      } @else {
        <div class="flex flex-col gap-3" data-testid="user-skeleton" aria-busy="true">
          <p-skeleton width="16rem" height="2rem" />
          <p-skeleton width="24rem" height="1rem" />
          <p-skeleton height="2.5rem" />
        </div>
      }
    </section>
  `,
})
export class UserCardPage {
  readonly userId = input.required<string>();

  protected readonly data = inject(UserCardData);
  protected readonly tabs = USER_TABS;
  protected readonly roleKey = roleKey;

  protected readonly planOf = computed(() => {
    const plan = this.data.plan();
    return plan.kind === 'ready' ? (plan.value?.plan ?? null) : null;
  });
  protected readonly trial = computed(() => {
    const plan = this.data.plan();
    return plan.kind === 'ready' && plan.value?.subscription?.status === 'trial';
  });
  protected readonly planLink = computed(() => userTabLink(this.userId(), 'plan'));

  constructor() {
    effect(() => this.data.userId.set(this.userId()));
  }

  protected tabLink(tab: UserTab): string[] {
    return userTabLink(this.userId(), tab);
  }

  protected errorKey(error: ApiError): string {
    if (error.isNetworkError) return 'users.errors.network';
    if (error.status === 403) return 'users.card.errors.forbidden';
    return 'users.card.errors.generic';
  }
}
