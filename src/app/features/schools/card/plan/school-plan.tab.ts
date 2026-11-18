import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { ButtonDirective } from 'primeng/button';
import { Skeleton } from 'primeng/skeleton';
import { Tag } from 'primeng/tag';
import {
  adminAccountsCancel,
  adminAccountsRevokeGrant,
} from '../../../../api/subscription/functions';
import { GrantResponseDto } from '../../../../api/subscription/models/grant-response-dto';
import { SubscriptionApi } from '../../../../api/subscription/subscription-api';
import { IfLevelDirective } from '../../../../core/auth/if-level.directive';
import { LanguageService } from '../../../../core/i18n/language.service';
import { LocalDatePipe } from '../../../../shared/local-date.pipe';
import { ReasonDialog } from '../../../../shared/reason-dialog/reason-dialog';
import { seatCeiling, seatLevel, seatLevelClass, seatsText } from '../../seats';
import { AssignPlanDialog } from './assign-plan-dialog';
import { SEATS_KEY } from './feature-keys';
import { GrantDialog } from './grant-dialog';
import { PAYER_TYPE, SchoolPlanData } from './school-plan.data';

const SUBSCRIPTION_SEVERITY = {
  trial: 'info',
  active: 'success',
  canceled: 'secondary',
  expired: 'secondary',
} as const;
const GRANT_SEVERITY = {
  scheduled: 'info',
  active: 'success',
  ended: 'secondary',
  revoked: 'secondary',
} as const;

/**
 * "Plan" tab of the school card (plan 90, phase 3, step 9): the plan that applies and its
 * version (an outdated version says so), live grants that switch keys on or off, the history of
 * subscriptions and grants. Changes (`admin`+) — change plan, cancel the subscription, issue and
 * revoke a grant — all go through the reason dialog; a 409 says "changed meanwhile".
 */
@Component({
  selector: 'app-school-plan-tab',
  providers: [SchoolPlanData],
  imports: [
    NgTemplateOutlet,
    TranslocoPipe,
    ButtonDirective,
    Skeleton,
    Tag,
    IfLevelDirective,
    LocalDatePipe,
    ReasonDialog,
    AssignPlanDialog,
    GrantDialog,
  ],
  template: `
    <div class="flex flex-col gap-4" data-testid="school-plan">
      <!-- The plan that applies now -->
      <section
        class="border-border flex flex-col gap-3 rounded-md border p-4"
        data-testid="plan-current"
      >
        <div class="flex flex-wrap items-center gap-2">
          <h2 class="text-base font-semibold">{{ 'schools.plan.current' | transloco }}</h2>
          <div class="ml-auto flex flex-wrap gap-2">
            <button
              *appIfLevel="'admin'"
              pButton
              type="button"
              size="small"
              data-testid="plan-assign"
              (click)="assignOpen.set(true)"
            >
              <i class="pi pi-sync" aria-hidden="true"></i>
              {{ 'schools.plan.assign' | transloco }}
            </button>
            @if (subscription()) {
              <button
                *appIfLevel="'admin'"
                pButton
                type="button"
                size="small"
                severity="danger"
                [outlined]="true"
                data-testid="plan-cancel"
                (click)="cancelOpen.set(true)"
              >
                <i class="pi pi-times" aria-hidden="true"></i>
                {{ 'schools.plan.cancel' | transloco }}
              </button>
            }
          </div>
        </div>

        @switch (data.card.plan().kind) {
          @case ('loading') {
            <p-skeleton width="16rem" height="1.5rem" />
          }
          @case ('error') {
            <p class="text-sm" role="alert" data-testid="plan-current-failed">
              {{ 'schools.plansFailed' | transloco }} ·
              <button type="button" class="text-primary underline" (click)="data.card.reloadPlan()">
                {{ 'schools.retry' | transloco }}
              </button>
            </p>
          }
          @default {
            @if (data.applied(); as applied) {
              <div class="flex flex-wrap items-center gap-2" data-testid="plan-name">
                @if (applied.plan; as plan) {
                  <span class="text-lg font-medium">{{ plan.name }}</span>
                  <span class="text-muted-color font-mono text-sm">
                    {{ plan.code }} · v{{ plan.version }}
                  </span>
                } @else {
                  <span>—</span>
                }
                @if (applied.subscription; as sub) {
                  <p-tag
                    [severity]="subscriptionSeverity[sub.status]"
                    [value]="'schools.plan.subscriptionStatus.' + sub.status | transloco"
                  />
                } @else {
                  <p-tag severity="secondary" [value]="'schools.plan.freeByDefault' | transloco" />
                }
              </div>

              @if (applied.subscription; as sub) {
                <p class="text-muted-color text-sm" data-testid="plan-period">
                  {{
                    'schools.plan.since'
                      | transloco: { date: (sub.periodStart | localDate: lang()) }
                  }}
                  ·
                  @if (sub.periodEnd) {
                    {{
                      'schools.plan.until'
                        | transloco: { date: (sub.periodEnd | localDate: lang()) }
                    }}
                  } @else {
                    {{ 'schools.plan.openEnded' | transloco }}
                  }
                </p>
              } @else if (!applied.hasAccount) {
                <p class="text-muted-color text-sm" data-testid="plan-no-account">
                  {{ 'schools.plan.noAccount' | transloco }}
                </p>
              } @else {
                <p class="text-muted-color text-sm" data-testid="plan-free">
                  {{ 'schools.plan.freeHint' | transloco }}
                </p>
              }

              @if (data.newerVersion(); as newer) {
                <div
                  class="flex flex-wrap items-center gap-2 rounded-md border border-amber-300 px-3 py-2 text-sm dark:border-amber-800"
                  data-testid="plan-outdated"
                >
                  <i class="pi pi-info-circle text-amber-500" aria-hidden="true"></i>
                  <span>
                    {{
                      'schools.plan.outdated'
                        | transloco: { version: applied.plan?.version, latest: newer }
                    }}
                  </span>
                  @if (applied.subscription) {
                    <button
                      *appIfLevel="'admin'"
                      type="button"
                      class="text-primary underline"
                      data-testid="plan-upgrade"
                      (click)="assignOpen.set(true)"
                    >
                      {{ 'schools.plan.moveTo' | transloco: { version: newer } }}
                    </button>
                  }
                </div>
              }

              <!-- What the version gives -->
              @switch (data.features().kind) {
                @case ('loading') {
                  <p-skeleton height="4rem" />
                }
                @case ('error') {
                  <p class="text-muted-color text-sm" data-testid="plan-features-failed">
                    {{ 'schools.plan.featuresFailed' | transloco }} ·
                    <button
                      type="button"
                      class="text-primary underline"
                      (click)="data.reloadFeatures()"
                    >
                      {{ 'schools.retry' | transloco }}
                    </button>
                  </p>
                }
                @default {
                  @if (features().length === 0) {
                    <p class="text-muted-color text-sm" data-testid="plan-features-empty">
                      {{ 'schools.plan.noFeatures' | transloco }}
                    </p>
                  } @else {
                    <div class="overflow-x-auto">
                      <table class="w-full text-sm" data-testid="plan-features">
                        <thead class="text-muted-color text-left">
                          <tr>
                            <th class="py-1 pr-4 font-medium">
                              {{ 'schools.plan.key' | transloco }}
                            </th>
                            <th class="py-1 pr-4 font-medium">
                              {{ 'schools.plan.effectColumn' | transloco }}
                            </th>
                            <th class="py-1 font-medium">
                              {{ 'schools.plan.credits' | transloco }}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          @for (f of features(); track f.featureKey) {
                            <tr class="border-border border-t" data-testid="plan-feature-row">
                              <td class="py-1 pr-4 font-mono text-xs">{{ f.featureKey }}</td>
                              <td class="py-1 pr-4">
                                {{
                                  'schools.plan.effect.' + (f.enabled ? 'on' : 'off') | transloco
                                }}
                              </td>
                              <td class="py-1 tabular-nums">
                                {{ valueText(f) | transloco: { n: valueOf(f) } }}
                              </td>
                            </tr>
                          }
                        </tbody>
                      </table>
                    </div>
                  }
                }
              }
            }
          }
        }
      </section>

      <!-- Student seats -->
      @if (seats(); as seats) {
        <section
          class="border-border flex flex-col gap-2 rounded-md border p-4"
          data-testid="plan-seats"
        >
          <h2 class="text-base font-semibold">{{ 'schools.plan.seats.title' | transloco }}</h2>
          <p class="text-lg tabular-nums" data-testid="plan-seats-usage">
            <span [class]="seatClass()" [attr.data-level]="seatLevelOf()">{{ seatsLabel() }}</span>
            <span class="text-muted-color text-sm">
              {{
                'schools.plan.seats.' + (seats.limit === null ? 'unlimited' : 'used') | transloco
              }}
            </span>
          </p>
          @if (seats.limit !== null) {
            <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt class="text-muted-color">{{ 'schools.plan.seats.limit' | transloco }}</dt>
              <dd class="tabular-nums" data-testid="plan-seats-limit">{{ seats.limit }}</dd>
              <dt class="text-muted-color">{{ 'schools.plan.seats.fromPlan' | transloco }}</dt>
              <dd class="tabular-nums" data-testid="plan-seats-plan">
                {{ planSeatLimit() ?? '—' }}
              </dd>
              <dt class="text-muted-color">{{ 'schools.plan.seats.fromGrant' | transloco }}</dt>
              <dd class="tabular-nums" data-testid="plan-seats-grant">
                {{ grantSeatLimit() ?? '—' }}
              </dd>
              <dt class="text-muted-color">{{ 'schools.plan.seats.ceiling' | transloco }}</dt>
              <dd class="tabular-nums">{{ ceiling() }}</dd>
            </dl>
          }
          <p class="text-muted-color text-xs">{{ 'schools.plan.seats.hint' | transloco }}</p>
        </section>
      }

      <!-- Live grants -->
      <section
        class="border-border flex flex-col gap-3 rounded-md border p-4"
        data-testid="plan-grants"
      >
        <div class="flex flex-wrap items-center gap-2">
          <h2 class="text-base font-semibold">{{ 'schools.plan.grants' | transloco }}</h2>
          <button
            *appIfLevel="'admin'"
            pButton
            type="button"
            size="small"
            class="ml-auto"
            [outlined]="true"
            data-testid="plan-grant"
            (click)="grantOpen.set(true)"
          >
            <i class="pi pi-plus" aria-hidden="true"></i>
            {{ 'schools.plan.issueGrant' | transloco }}
          </button>
        </div>
        @switch (data.account().kind) {
          @case ('loading') {
            <p-skeleton height="3rem" />
          }
          @case ('error') {
            <p class="text-sm" role="alert" data-testid="plan-grants-failed">
              {{ 'schools.plan.accountFailed' | transloco }} ·
              <button type="button" class="text-primary underline" (click)="data.reloadAccount()">
                {{ 'schools.retry' | transloco }}
              </button>
            </p>
          }
          @default {
            @if (liveGrants().length === 0) {
              <p class="text-muted-color text-sm" data-testid="plan-grants-empty">
                {{ 'schools.plan.noGrants' | transloco }}
              </p>
            } @else {
              <ng-container
                *ngTemplateOutlet="grantTable; context: { $implicit: liveGrants(), live: true }"
              />
            }
          }
        }
      </section>

      <!-- History -->
      <section
        class="border-border flex flex-col gap-3 rounded-md border p-4"
        data-testid="plan-history"
      >
        <h2 class="text-base font-semibold">{{ 'schools.plan.history' | transloco }}</h2>
        @switch (data.history().kind) {
          @case ('loading') {
            <p-skeleton height="3rem" />
          }
          @case ('error') {
            <p class="text-sm" role="alert" data-testid="plan-history-failed">
              {{ 'schools.plan.historyFailed' | transloco }} ·
              <button type="button" class="text-primary underline" (click)="data.reloadHistory()">
                {{ 'schools.retry' | transloco }}
              </button>
            </p>
          }
          @default {
            <h3 class="text-sm font-medium">{{ 'schools.plan.subscriptions' | transloco }}</h3>
            @if (pastSubscriptions().length === 0) {
              <p class="text-muted-color text-sm" data-testid="plan-subscriptions-empty">
                {{ 'schools.plan.noSubscriptions' | transloco }}
              </p>
            } @else {
              <div class="overflow-x-auto">
                <table class="w-full min-w-[36rem] text-sm" data-testid="plan-subscriptions">
                  <thead class="text-muted-color text-left">
                    <tr>
                      <th class="py-1 pr-4 font-medium">
                        {{ 'schools.columns.plan' | transloco }}
                      </th>
                      <th class="py-1 pr-4 font-medium">
                        {{ 'schools.columns.status' | transloco }}
                      </th>
                      <th class="py-1 pr-4 font-medium">{{ 'schools.plan.term' | transloco }}</th>
                      <th class="py-1 font-medium">{{ 'schools.plan.endedAt' | transloco }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (s of pastSubscriptions(); track s.id) {
                      <tr class="border-border border-t" data-testid="plan-subscription-row">
                        <td class="py-1 pr-4">
                          {{ s.planName }}
                          <span class="text-muted-color font-mono text-xs"
                            >v{{ s.planVersion }}</span
                          >
                        </td>
                        <td class="py-1 pr-4">
                          {{ 'schools.plan.subscriptionStatus.' + s.status | transloco }}
                        </td>
                        <td class="py-1 pr-4">
                          {{ s.periodStart | localDate: lang() }} –
                          {{ s.periodEnd ? (s.periodEnd | localDate: lang()) : '…' }}
                        </td>
                        <td class="py-1">
                          {{ s.endedAt ? (s.endedAt | localDate: lang()) : '—' }}
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }

            <h3 class="text-sm font-medium">{{ 'schools.plan.pastGrants' | transloco }}</h3>
            @if (pastGrants().length === 0) {
              <p class="text-muted-color text-sm" data-testid="plan-past-grants-empty">
                {{ 'schools.plan.noPastGrants' | transloco }}
              </p>
            } @else {
              <ng-container
                *ngTemplateOutlet="grantTable; context: { $implicit: pastGrants(), live: false }"
              />
            }
          }
        }
      </section>
    </div>

    <ng-template #grantTable let-grants let-live="live">
      <div class="overflow-x-auto">
        <table
          class="w-full min-w-[44rem] text-sm"
          [attr.data-testid]="live ? 'plan-grants-table' : 'plan-past-grants'"
        >
          <thead class="text-muted-color text-left">
            <tr>
              <th class="py-1 pr-4 font-medium">{{ 'schools.plan.key' | transloco }}</th>
              <th class="py-1 pr-4 font-medium">{{ 'schools.plan.effectColumn' | transloco }}</th>
              <th class="py-1 pr-4 font-medium">{{ 'schools.plan.credits' | transloco }}</th>
              <th class="py-1 pr-4 font-medium">{{ 'schools.plan.term' | transloco }}</th>
              <th class="py-1 pr-4 font-medium">{{ 'schools.columns.status' | transloco }}</th>
              <th class="py-1 pr-4 font-medium">{{ 'reasonDialog.label' | transloco }}</th>
              @if (live) {
                <th class="py-1">
                  <span class="sr-only">{{ 'schools.plan.actions' | transloco }}</span>
                </th>
              }
            </tr>
          </thead>
          <tbody>
            @for (row of grants; track row.id) {
              @let g = asGrant(row);
              <tr class="border-border border-t align-top" data-testid="grant-row">
                <td class="py-1 pr-4 font-mono text-xs">{{ g.featureKey }}</td>
                <td class="py-1 pr-4 whitespace-nowrap">
                  <p-tag
                    [severity]="g.enabled ? 'success' : 'warn'"
                    [value]="'schools.plan.grantEffect.' + (g.enabled ? 'on' : 'off') | transloco"
                  />
                </td>
                <td class="py-1 pr-4 tabular-nums">
                  {{ valueText(g) | transloco: { n: valueOf(g) } }}
                </td>
                <td class="py-1 pr-4 whitespace-nowrap">
                  {{ g.startsAt | localDate: lang() }} – {{ g.endsAt | localDate: lang() }}
                </td>
                <td class="py-1 pr-4 whitespace-nowrap">
                  <p-tag
                    [severity]="grantSeverity[g.state]"
                    [value]="'schools.plan.grantState.' + g.state | transloco"
                  />
                  @if (g.revokedAt) {
                    <div class="text-muted-color text-xs">
                      {{ g.revokedAt | localDate: lang() }}
                    </div>
                  }
                </td>
                <td class="min-w-48 py-1 pr-4 break-words">{{ g.reason }}</td>
                @if (live) {
                  <td class="py-1 text-right">
                    <button
                      *appIfLevel="'admin'"
                      pButton
                      type="button"
                      size="small"
                      severity="danger"
                      [text]="true"
                      data-testid="grant-revoke"
                      (click)="revoking.set(g)"
                    >
                      {{ 'schools.plan.revoke' | transloco }}
                    </button>
                  </td>
                }
              </tr>
            }
          </tbody>
        </table>
      </div>
    </ng-template>

    @if (schoolId(); as schoolId) {
      <app-assign-plan-dialog
        [(visible)]="assignOpen"
        [payerId]="schoolId"
        [plans]="assignable()"
        [currentCode]="subscription()?.planCode ?? null"
        (retryPlans)="data.reloadPlans()"
        (done)="data.afterChange()"
      />
      <app-grant-dialog [(visible)]="grantOpen" [payerId]="schoolId" (done)="data.afterChange()" />
    }

    <app-reason-dialog
      [(visible)]="cancelOpen"
      [header]="'schools.plan.cancelDialog.title' | transloco"
      [confirmLabel]="'schools.plan.cancelDialog.confirm' | transloco"
      level="admin"
      [danger]="true"
      [action]="cancel"
      (done)="data.afterChange()"
    >
      <p class="text-sm" data-testid="cancel-text">
        {{ 'schools.plan.cancelDialog.text' | transloco: { plan: subscription()?.planName } }}
      </p>
    </app-reason-dialog>

    <app-reason-dialog
      [visible]="revoking() !== null"
      (visibleChange)="$event || revoking.set(null)"
      [header]="'schools.plan.revokeDialog.title' | transloco"
      [confirmLabel]="'schools.plan.revokeDialog.confirm' | transloco"
      level="admin"
      [danger]="true"
      [action]="revoke"
      (done)="data.afterChange()"
    >
      @if (revoking(); as g) {
        <p class="text-sm" data-testid="revoke-text">
          {{
            (g.enabled ? 'schools.plan.revokeDialog.textOn' : 'schools.plan.revokeDialog.textOff')
              | transloco: { key: g.featureKey }
          }}
        </p>
      }
    </app-reason-dialog>
  `,
})
export class SchoolPlanTab {
  protected readonly data = inject(SchoolPlanData);
  private readonly api = inject(SubscriptionApi);
  protected readonly lang = inject(LanguageService).current;
  protected readonly subscriptionSeverity = SUBSCRIPTION_SEVERITY;
  protected readonly grantSeverity = GRANT_SEVERITY;

  protected readonly assignOpen = signal(false);
  protected readonly grantOpen = signal(false);
  protected readonly cancelOpen = signal(false);
  /** The grant whose revoke dialog is open. */
  protected readonly revoking = signal<GrantResponseDto | null>(null);

  protected readonly schoolId = this.data.card.schoolId;

  /** The running subscription, from the account (`null` = free plan or no account). */
  protected readonly subscription = computed(() => {
    const account = this.data.account();
    return account.kind === 'ready' ? (account.value?.subscription ?? null) : null;
  });
  protected readonly liveGrants = computed(() => {
    const account = this.data.account();
    return account.kind === 'ready' ? (account.value?.grants ?? []) : [];
  });
  protected readonly features = computed(() => {
    const features = this.data.features();
    return features.kind === 'ready' ? features.value : [];
  });
  /** Every subscription, newest first — the running one too. */
  protected readonly pastSubscriptions = computed(() => {
    const history = this.data.history();
    return history.kind === 'ready' ? (history.value?.subscriptions ?? []) : [];
  });
  protected readonly pastGrants = computed(() => {
    const history = this.data.history();
    if (history.kind !== 'ready') return [];
    return (history.value?.grants ?? []).filter(
      (g) => g.state === 'ended' || g.state === 'revoked',
    );
  });
  /** The school's seats as organization counts them (the card's read), or nothing before it. */
  protected readonly seats = computed(() => this.data.card.school()?.seats ?? null);
  protected readonly seatLevelOf = computed(() => {
    const seats = this.seats();
    return seats ? seatLevel(seats.used, seats.limit) : 'none';
  });
  protected readonly seatClass = computed(() => seatLevelClass(this.seatLevelOf()));
  protected readonly seatsLabel = computed(() => {
    const seats = this.seats();
    return seats ? seatsText(seats.used, seats.limit) : '—';
  });
  protected readonly ceiling = computed(() => {
    const limit = this.seats()?.limit;
    return limit === null || limit === undefined ? null : seatCeiling(limit);
  });
  /** The applied version's own limit, when the version is read. */
  protected readonly planSeatLimit = computed(() => {
    const features = this.data.features();
    if (features.kind !== 'ready') return null;
    const row = features.value.find((f) => f.featureKey === SEATS_KEY && f.enabled);
    return row ? SchoolPlanTab.maxOf(row) : null;
  });
  /** The largest limit among live grants that give seats (a grant only raises the plan's). */
  protected readonly grantSeatLimit = computed(() => {
    const limits = this.liveGrants()
      .filter((g) => g.featureKey === SEATS_KEY && g.state === 'active')
      .map((g) => SchoolPlanTab.maxOf(g))
      .filter((max): max is number => max !== null);
    return limits.length === 0 ? null : Math.max(...limits);
  });
  protected readonly assignable = computed(() => {
    const plans = this.data.plans();
    return plans.kind === 'ready'
      ? { kind: 'ready' as const, value: this.data.assignablePlans() }
      : plans;
  });

  protected readonly cancel = (reason: string) =>
    this.api.invoke(adminAccountsCancel, {
      type: PAYER_TYPE,
      externalId: this.schoolId()!,
      reason,
    });

  protected readonly revoke = (reason: string) =>
    this.api.invoke(adminAccountsRevokeGrant, {
      type: PAYER_TYPE,
      externalId: this.schoolId()!,
      grantId: this.revoking()!.id,
      body: { reason },
    });

  /** The seat limit (`limits.max`) of a feature row or grant; `null` when it carries none. */
  private static maxOf(row: { limits: object }): number | null {
    const max = (row.limits as { max?: unknown }).max;
    return typeof max === 'number' ? max : null;
  }

  /** Translation key of a row's value: seats show their limit, the rest their credits. */
  protected valueText(row: {
    featureKey: string;
    enabled: boolean;
    monthlyCredits: string | null;
  }): string {
    return row.featureKey === SEATS_KEY
      ? 'schools.plan.seats.max'
      : this.creditsText(row.enabled, row.monthlyCredits);
  }

  protected valueOf(row: {
    featureKey: string;
    limits: object;
    monthlyCredits: string | null;
  }): string | number | null {
    return row.featureKey === SEATS_KEY ? SchoolPlanTab.maxOf(row) : row.monthlyCredits;
  }

  /** `null` credits: unmetered on a key that is on, nothing on a key that is off. */
  protected creditsText(enabled: boolean, credits: string | null): string {
    if (!enabled) return 'schools.plan.noCredits';
    return credits === null ? 'schools.plan.unmetered' : 'schools.plan.creditsPerMonth';
  }

  protected asGrant(row: unknown): GrantResponseDto {
    return row as GrantResponseDto;
  }
}
