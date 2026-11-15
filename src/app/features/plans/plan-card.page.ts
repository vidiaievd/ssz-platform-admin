import { DecimalPipe } from '@angular/common';
import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { ButtonDirective } from 'primeng/button';
import { Skeleton } from 'primeng/skeleton';
import { Tag } from 'primeng/tag';
import { adminPlansArchive } from '../../api/subscription/functions';
import { SubscriptionApi } from '../../api/subscription/subscription-api';
import { IfLevelDirective } from '../../core/auth/if-level.directive';
import { LanguageService } from '../../core/i18n/language.service';
import { LocalDatePipe } from '../../shared/local-date.pipe';
import { ReasonDialog } from '../../shared/reason-dialog/reason-dialog';
import { isFreePlan, termsOf } from './plan-model';
import { PlanRenameDialog } from './plan-rename-dialog';
import { PlanTerms } from './plan-terms';
import { PlanCardData } from './plans.data';

/**
 * `/plans/:code` — the plan card (plan 90, phase 8, step 13): every version, newest first, with
 * its subscribers (`byVersion` of the stats), its keys and what changed against the version
 * below. `super` renames the plan and archives it, each with a reason; a free plan is never
 * archived (every new account opens on it).
 */
@Component({
  selector: 'app-plan-card-page',
  providers: [PlanCardData],
  imports: [
    DecimalPipe,
    RouterLink,
    TranslocoPipe,
    ButtonDirective,
    Skeleton,
    Tag,
    IfLevelDirective,
    LocalDatePipe,
    ReasonDialog,
    PlanRenameDialog,
    PlanTerms,
  ],
  template: `
    <section class="flex flex-col gap-4" data-testid="plan-card">
      <a class="text-primary flex w-fit items-center gap-1 text-sm" routerLink="/plans">
        <i class="pi pi-arrow-left" aria-hidden="true"></i>
        {{ 'plans.card.back' | transloco }}
      </a>

      @if (data.notFound()) {
        <div class="flex max-w-2xl flex-col gap-2" data-testid="plan-not-found">
          <h1 class="text-2xl font-semibold" data-testid="page-title">
            {{ 'plans.card.notFound' | transloco }}
          </h1>
          <p class="text-muted-color font-mono text-sm">{{ code() }}</p>
        </div>
      } @else {
        @switch (data.plan().kind) {
          @case ('loading') {
            <p-skeleton height="2rem" width="16rem" />
            <p-skeleton height="16rem" />
          }
          @case ('error') {
            <p class="text-sm" role="alert" data-testid="plan-failed">
              {{ 'plans.card.failed' | transloco }} ·
              <button type="button" class="text-primary underline" (click)="data.reload()">
                {{ 'schools.retry' | transloco }}
              </button>
            </p>
          }
          @default {
            @if (data.details(); as plan) {
              <header class="flex flex-col gap-2" data-testid="plan-header">
                <div class="flex flex-wrap items-center gap-2">
                  <h1 class="text-2xl font-semibold" data-testid="page-title">{{ plan.name }}</h1>
                  <p-tag
                    severity="secondary"
                    [value]="'plans.audience.' + plan.audience | transloco"
                    data-testid="plan-audience"
                  />
                  @if (plan.status === 'archived') {
                    <p-tag
                      severity="secondary"
                      [value]="'plans.status.archived' | transloco"
                      data-testid="plan-status"
                    />
                  } @else {
                    <p-tag
                      severity="success"
                      [value]="'plans.status.active' | transloco"
                      data-testid="plan-status"
                    />
                  }
                  @if (free()) {
                    <p-tag
                      severity="info"
                      [value]="'plans.free' | transloco"
                      data-testid="plan-free"
                    />
                  }
                  <span class="ml-auto flex flex-wrap gap-2">
                    <button
                      *appIfLevel="'super'"
                      type="button"
                      pButton
                      size="small"
                      severity="secondary"
                      data-testid="plan-rename"
                      (click)="renameOpen.set(true)"
                    >
                      <i class="pi pi-pencil" aria-hidden="true"></i>
                      {{ 'plans.card.rename' | transloco }}
                    </button>
                    @if (plan.status === 'active' && !free()) {
                      <button
                        *appIfLevel="'super'"
                        type="button"
                        pButton
                        size="small"
                        severity="danger"
                        [outlined]="true"
                        data-testid="plan-archive"
                        (click)="archiveOpen.set(true)"
                      >
                        <i class="pi pi-box" aria-hidden="true"></i>
                        {{ 'plans.card.archive' | transloco }}
                      </button>
                    }
                    <button
                      type="button"
                      pButton
                      size="small"
                      severity="secondary"
                      data-testid="plan-refresh"
                      [attr.aria-label]="'plans.refresh' | transloco"
                      (click)="data.reload()"
                    >
                      <i class="pi pi-refresh" aria-hidden="true"></i>
                    </button>
                  </span>
                </div>
                <div class="text-muted-color flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                  <span class="font-mono" data-testid="plan-code">{{ plan.code }}</span>
                  <span data-testid="plan-current">
                    {{ 'plans.card.current' | transloco: { version: plan.current.version } }}
                  </span>
                  <span data-testid="plan-subscribers">
                    @switch (data.stats().kind) {
                      @case ('loading') {
                        <p-skeleton width="6rem" />
                      }
                      @case ('error') {
                        {{ 'plans.columns.subscribers' | transloco }}: —
                        <button
                          type="button"
                          class="text-primary underline"
                          data-testid="plan-stats-retry"
                          (click)="data.reloadStats()"
                        >
                          {{ 'schools.retry' | transloco }}
                        </button>
                      }
                      @default {
                        @if (data.subscribers(); as s) {
                          {{ 'plans.card.subscribers' | transloco: { n: (s.total | number) } }}
                          @if (s.onOlder > 0) {
                            ·
                            <span
                              class="text-amber-700 dark:text-amber-400"
                              data-testid="plan-older"
                            >
                              {{ 'plans.older' | transloco: { n: s.onOlder } }}
                            </span>
                          }
                          @if (s.trial > 0) {
                            · {{ 'plans.trial' | transloco: { n: s.trial } }}
                          }
                        }
                      }
                    }
                  </span>
                </div>
                @if (plan.status === 'archived') {
                  <p class="text-muted-color text-sm" data-testid="plan-archived-note">
                    {{ 'plans.card.archivedNote' | transloco }}
                  </p>
                }
                @if (free()) {
                  <p class="text-muted-color text-sm" data-testid="plan-free-note">
                    {{ 'plans.card.freeNote' | transloco }}
                  </p>
                }
                <p class="text-muted-color text-xs">{{ 'plans.card.versionsNote' | transloco }}</p>
              </header>

              <!-- Versions, newest first -->
              <ol class="flex flex-col gap-3" data-testid="plan-versions">
                @for (v of data.versions(); track v.version) {
                  <li
                    class="border-border flex flex-col gap-3 rounded-md border p-4"
                    data-testid="plan-version"
                    [attr.data-version]="v.version"
                    [attr.data-current]="v.current"
                  >
                    <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <h2 class="text-base font-semibold">v{{ v.version }}</h2>
                      @if (v.current) {
                        <p-tag
                          [value]="'plans.card.currentTag' | transloco"
                          data-testid="version-current"
                        />
                      }
                      <span class="text-muted-color text-sm" data-testid="version-created">
                        {{ v.createdAt | localDate: lang() }} ·
                        @if (v.createdBy) {
                          <span class="font-mono text-xs" [title]="v.createdBy">{{
                            v.createdBy.slice(0, 8)
                          }}</span>
                        } @else {
                          {{ 'plans.card.seed' | transloco }}
                        }
                      </span>
                      <span class="ml-auto text-sm tabular-nums" data-testid="version-subscribers">
                        @if (v.subscribers === null) {
                          —
                        } @else {
                          {{
                            'plans.card.subscribers' | transloco: { n: (v.subscribers | number) }
                          }}
                        }
                      </span>
                    </div>

                    @if (v.features.length === 0) {
                      <p class="text-muted-color text-sm" data-testid="version-no-keys">
                        {{ 'plans.card.noKeys' | transloco }}
                      </p>
                    } @else {
                      <div class="overflow-x-auto">
                        <table class="w-full text-sm" data-testid="version-keys">
                          <thead class="text-muted-color text-left text-xs">
                            <tr>
                              <th scope="col" class="py-1 pr-4 font-medium">
                                {{ 'plans.card.key' | transloco }}
                              </th>
                              <th scope="col" class="py-1 font-medium">
                                {{ 'plans.card.terms' | transloco }}
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            @for (f of v.features; track f.featureKey) {
                              <tr
                                class="border-border border-t"
                                data-testid="version-key"
                                [attr.data-key]="f.featureKey"
                              >
                                <td class="py-1 pr-4 font-mono text-xs">{{ f.featureKey }}</td>
                                <td class="py-1">
                                  <app-plan-terms [featureKey]="f.featureKey" [terms]="terms(f)" />
                                </td>
                              </tr>
                            }
                          </tbody>
                        </table>
                      </div>
                    }

                    @if (v.previous !== null) {
                      <div class="flex flex-col gap-1" data-testid="version-changes">
                        <h3 class="text-muted-color text-xs uppercase">
                          {{ 'plans.card.changesFrom' | transloco: { version: v.previous } }}
                        </h3>
                        @if (v.changes.length === 0) {
                          <p class="text-muted-color text-sm" data-testid="version-no-changes">
                            {{ 'plans.card.noChanges' | transloco }}
                          </p>
                        } @else {
                          <ul class="flex flex-col gap-1 text-sm">
                            @for (c of v.changes; track c.featureKey) {
                              <li
                                class="flex flex-wrap items-center gap-x-2"
                                data-testid="version-change"
                                [attr.data-key]="c.featureKey"
                                [attr.data-change]="c.change"
                              >
                                <p-tag
                                  [severity]="changeSeverity[c.change]"
                                  [value]="'plans.card.change.' + c.change | transloco"
                                />
                                <span class="font-mono text-xs">{{ c.featureKey }}</span>
                                @if (c.before) {
                                  <span [class.line-through]="c.change === 'removed'">
                                    <app-plan-terms
                                      [featureKey]="c.featureKey"
                                      [terms]="c.before"
                                    />
                                  </span>
                                }
                                @if (c.before && c.after) {
                                  <i class="pi pi-arrow-right text-xs" aria-hidden="true"></i>
                                  <span class="sr-only">{{
                                    'plans.card.becomes' | transloco
                                  }}</span>
                                }
                                @if (c.after) {
                                  <app-plan-terms [featureKey]="c.featureKey" [terms]="c.after" />
                                }
                              </li>
                            }
                          </ul>
                        }
                      </div>
                    }
                  </li>
                }
              </ol>

              <app-plan-rename-dialog
                [(visible)]="renameOpen"
                [code]="plan.code"
                [currentName]="plan.name"
                (done)="data.changed($event)"
              />
              <app-reason-dialog
                [(visible)]="archiveOpen"
                [header]="'plans.card.archiveDialog.title' | transloco"
                [confirmLabel]="'plans.card.archiveDialog.confirm' | transloco"
                level="super"
                [danger]="true"
                [action]="archive"
                (done)="data.changed($event)"
              >
                <p class="text-sm" data-testid="archive-text">
                  {{ 'plans.card.archiveDialog.text' | transloco: { plan: plan.name } }}
                </p>
                @if (data.subscribers(); as s) {
                  @if (s.total > 0) {
                    <p class="text-sm" data-testid="archive-subscribers">
                      {{ 'plans.card.archiveDialog.subscribers' | transloco: { n: s.total } }}
                    </p>
                  }
                }
                <p class="text-muted-color text-xs">
                  {{ 'plans.card.archiveDialog.final' | transloco }}
                </p>
              </app-reason-dialog>
            }
          }
        }
      }
    </section>
  `,
})
export class PlanCardPage {
  /** From the route (`:code`). */
  readonly code = input.required<string>();

  protected readonly data = inject(PlanCardData);
  protected readonly lang = inject(LanguageService).current;
  private readonly api = inject(SubscriptionApi);

  protected readonly renameOpen = signal(false);
  protected readonly archiveOpen = signal(false);

  protected readonly free = computed(() => isFreePlan(this.code()));
  protected readonly terms = termsOf;

  protected readonly changeSeverity = {
    added: 'success',
    removed: 'danger',
    changed: 'warn',
  } as const;

  constructor() {
    effect(() => this.data.code.set(this.code()));
  }

  protected readonly archive = (reason: string) =>
    this.api.invoke(adminPlansArchive, { code: this.code(), body: { reason } });
}
