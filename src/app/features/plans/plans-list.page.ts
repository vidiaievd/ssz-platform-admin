import { DecimalPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { ButtonDirective } from 'primeng/button';
import { Skeleton } from 'primeng/skeleton';
import { Tag } from 'primeng/tag';
import { PlansListData } from './plans.data';

/**
 * `/plans` — the plan catalog (plan 90, phase 8, step 13): every plan by audience with its
 * current version, keys and subscribers; archived plans stay, muted, below the active ones.
 * Each row opens the plan card.
 */
@Component({
  selector: 'app-plans-list-page',
  providers: [PlansListData],
  imports: [DecimalPipe, RouterLink, TranslocoPipe, ButtonDirective, Skeleton, Tag],
  template: `
    <section class="flex flex-col gap-4" data-testid="plans-list">
      <div class="flex flex-wrap items-center gap-2">
        <h1 class="text-2xl font-semibold" data-testid="page-title">
          {{ 'nav.plans' | transloco }}
        </h1>
        <button
          type="button"
          pButton
          size="small"
          severity="secondary"
          class="ml-auto"
          data-testid="plans-refresh"
          [attr.aria-label]="'plans.refresh' | transloco"
          (click)="data.reload()"
        >
          <i class="pi pi-refresh" aria-hidden="true"></i>
        </button>
      </div>
      <p class="text-muted-color text-sm">{{ 'plans.intro' | transloco }}</p>

      @switch (data.plans().kind) {
        @case ('loading') {
          <p-skeleton height="16rem" />
        }
        @case ('error') {
          <p class="text-sm" role="alert" data-testid="plans-failed">
            {{ 'plans.failed' | transloco }} ·
            <button type="button" class="text-primary underline" (click)="data.reload()">
              {{ 'schools.retry' | transloco }}
            </button>
          </p>
        }
        @default {
          @if (data.stats().kind === 'error') {
            <p class="text-sm" role="alert" data-testid="plans-stats-failed">
              {{ 'plans.statsFailed' | transloco }} ·
              <button type="button" class="text-primary underline" (click)="data.reloadStats()">
                {{ 'schools.retry' | transloco }}
              </button>
            </p>
          }

          @for (group of data.groups(); track group.audience) {
            <section class="flex flex-col gap-2" [attr.data-testid]="'plans-' + group.audience">
              <h2 class="text-base font-semibold">
                {{ 'plans.audience.' + group.audience | transloco }}
              </h2>
              <div class="border-border overflow-x-auto rounded-md border">
                <table class="w-full min-w-[40rem] text-sm">
                  <thead>
                    <tr class="border-border text-muted-color border-b text-left text-xs">
                      <th scope="col" class="px-3 py-2 font-medium">
                        {{ 'plans.columns.plan' | transloco }}
                      </th>
                      <th scope="col" class="px-3 py-2 font-medium">
                        {{ 'plans.columns.version' | transloco }}
                      </th>
                      <th scope="col" class="px-3 py-2 text-right font-medium">
                        {{ 'plans.columns.keys' | transloco }}
                      </th>
                      <th scope="col" class="px-3 py-2 text-right font-medium">
                        {{ 'plans.columns.subscribers' | transloco }}
                      </th>
                      <th scope="col" class="px-3 py-2 font-medium">
                        {{ 'plans.columns.status' | transloco }}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (row of group.rows; track row.code) {
                      <tr
                        class="border-border border-b last:border-b-0"
                        [class.opacity-60]="row.archived"
                        data-testid="plan-row"
                        [attr.data-code]="row.code"
                        [attr.data-archived]="row.archived"
                      >
                        <td class="px-3 py-2">
                          <a
                            class="font-medium hover:underline"
                            [routerLink]="['/plans', row.code]"
                            data-testid="plan-link"
                            >{{ row.name }}</a
                          >
                          <span class="text-muted-color block font-mono text-xs">{{
                            row.code
                          }}</span>
                        </td>
                        <td class="px-3 py-2 tabular-nums" data-testid="plan-version">
                          v{{ row.currentVersion }}
                        </td>
                        <td class="px-3 py-2 text-right tabular-nums" data-testid="plan-keys">
                          {{ row.keys }}
                        </td>
                        <td class="px-3 py-2 text-right" data-testid="plan-subscribers">
                          @if (row.subscribers; as s) {
                            <span class="tabular-nums">{{ s.total | number }}</span>
                            @if (s.onOlder > 0) {
                              <span
                                class="block text-xs text-amber-700 tabular-nums dark:text-amber-400"
                                data-testid="plan-older"
                              >
                                {{ 'plans.older' | transloco: { n: s.onOlder } }}
                              </span>
                            }
                            @if (s.trial > 0) {
                              <span class="text-muted-color block text-xs tabular-nums">
                                {{ 'plans.trial' | transloco: { n: s.trial } }}
                              </span>
                            }
                          } @else if (data.stats().kind === 'loading') {
                            <p-skeleton width="2rem" styleClass="ml-auto" />
                          } @else {
                            —
                          }
                        </td>
                        <td class="px-3 py-2">
                          <span class="flex flex-wrap gap-1">
                            @if (row.archived) {
                              <p-tag
                                severity="secondary"
                                [value]="'plans.status.archived' | transloco"
                                data-testid="plan-archived"
                              />
                            } @else {
                              <p-tag
                                severity="success"
                                [value]="'plans.status.active' | transloco"
                              />
                            }
                            @if (row.free) {
                              <p-tag
                                severity="info"
                                [value]="'plans.free' | transloco"
                                data-testid="plan-free"
                              />
                            }
                          </span>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </section>
          } @empty {
            <p class="text-muted-color text-sm" data-testid="plans-empty">
              {{ 'plans.none' | transloco }}
            </p>
          }

          <p class="text-muted-color text-xs" data-testid="plans-free-note">
            {{ 'plans.freeNote' | transloco }}
          </p>
        }
      }
    </section>
  `,
})
export class PlansListPage {
  protected readonly data = inject(PlansListData);
}
