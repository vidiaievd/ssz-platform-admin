import { Component, computed, inject, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { ButtonDirective } from 'primeng/button';
import { Skeleton } from 'primeng/skeleton';
import { Tag } from 'primeng/tag';
import { IfLevelDirective } from '../../../core/auth/if-level.directive';
import { CLIENT_TYPES, ClientType, TokenLifetimes } from '../../../core/auth/token-lifetimes.api';
import { LanguageService } from '../../../core/i18n/language.service';
import { LocalDatePipe } from '../../../shared/local-date.pipe';
import { DurationPipe } from './duration.pipe';
import { LifetimeDialog, LifetimeTarget } from './lifetime-dialog';
import { LifetimeCell, LifetimeRow } from './token-lifetime-rows';
import { TokenLifetimesData } from './token-lifetimes.data';

/**
 * `/platform/sessions` — "Platform → Session lifetimes" (plan 90, phase 8, step 11): how long a
 * refresh token lives per role × client (ADR-012). Every level reads; `super` changes one pair at
 * a time, with a reason that lands in the admin journal. A change applies to tokens issued or
 * rotated after it — sessions already open keep their end until their next refresh.
 */
@Component({
  selector: 'app-token-lifetimes-page',
  providers: [TokenLifetimesData],
  imports: [
    TranslocoPipe,
    ButtonDirective,
    Skeleton,
    Tag,
    IfLevelDirective,
    LocalDatePipe,
    DurationPipe,
    LifetimeDialog,
  ],
  template: `
    <section class="flex flex-col gap-4" data-testid="platform-sessions">
      <div class="flex flex-wrap items-center gap-2">
        <h2 class="text-base font-semibold">{{ 'platform.sessions.title' | transloco }}</h2>
        <button
          type="button"
          pButton
          size="small"
          severity="secondary"
          class="ml-auto"
          data-testid="sessions-refresh"
          [attr.aria-label]="'platform.sessions.refresh' | transloco"
          (click)="data.reload()"
        >
          <i class="pi pi-refresh" aria-hidden="true"></i>
        </button>
      </div>

      <p class="text-muted-color text-sm" data-testid="sessions-intro">
        {{ 'platform.sessions.intro' | transloco }}
      </p>
      <p
        class="flex items-start gap-2 rounded-md border border-sky-300 bg-sky-50 p-3 text-sm dark:border-sky-800 dark:bg-sky-950"
        role="note"
        data-testid="sessions-applies"
      >
        <i class="pi pi-info-circle mt-0.5 text-sky-500" aria-hidden="true"></i>
        <span>{{ 'platform.sessions.appliesNote' | transloco }}</span>
      </p>

      @switch (data.state().kind) {
        @case ('loading') {
          <p-skeleton height="1.25rem" width="18rem" />
          <p-skeleton height="16rem" />
        }
        @case ('error') {
          <p class="text-sm" role="alert" data-testid="sessions-failed">
            {{ 'platform.sessions.failed' | transloco }} ·
            <button type="button" class="text-primary underline" (click)="data.reload()">
              {{ 'schools.retry' | transloco }}
            </button>
          </p>
        }
        @default {
          @if (value(); as v) {
            <p class="text-sm" data-testid="sessions-fallback">
              {{ 'platform.sessions.fallback' | transloco }}
              <strong class="tabular-nums">{{
                'platform.sessions.duration.hours' | transloco: { hours: v.fallbackHours }
              }}</strong>
              <span class="text-muted-color">· {{ v.fallbackHours | duration }}</span>
              <span class="text-muted-color block text-xs">
                {{ 'platform.sessions.fallbackHint' | transloco }}
              </span>
            </p>
          }

          <div class="border-border relative overflow-x-auto rounded-md border">
            <table class="w-full min-w-[36rem] text-sm" data-testid="sessions-table">
              <caption class="sr-only">
                {{
                  'platform.sessions.title' | transloco
                }}
              </caption>
              <thead>
                <tr class="border-border text-muted-color border-b text-left text-xs">
                  <th scope="col" class="px-3 py-2 font-medium">
                    {{ 'platform.sessions.role' | transloco }}
                  </th>
                  @for (client of clients; track client) {
                    <th scope="col" class="px-3 py-2 font-medium">
                      {{ 'platform.sessions.clients.' + client | transloco }}
                    </th>
                  }
                </tr>
              </thead>
              <tbody>
                @for (row of data.rows(); track row.role) {
                  <tr
                    class="border-border border-b last:border-b-0"
                    data-testid="sessions-row"
                    [attr.data-role]="row.role"
                  >
                    <th scope="row" class="px-3 py-2 text-left align-top font-medium">
                      {{ 'platform.sessions.roles.' + row.role | transloco: { role: row.role } }}
                      <span class="text-muted-color block font-mono text-xs font-normal">{{
                        row.role
                      }}</span>
                    </th>
                    @for (client of clients; track client) {
                      @let cell = row.cells[client];
                      <td
                        class="px-3 py-2 align-top"
                        data-testid="sessions-cell"
                        [attr.data-client]="client"
                        [attr.data-kind]="cell.kind"
                      >
                        @switch (cell.kind) {
                          @case ('unused') {
                            <span
                              class="text-muted-color"
                              [title]="'platform.sessions.unusedHint' | transloco"
                              data-testid="cell-unused"
                            >
                              —
                              <span class="sr-only">{{
                                'platform.sessions.unusedHint' | transloco
                              }}</span>
                            </span>
                          }
                          @default {
                            <div class="flex items-start gap-2">
                              <div class="flex flex-col">
                                <span
                                  class="tabular-nums"
                                  [class.text-muted-color]="cell.kind === 'fallback'"
                                  data-testid="cell-hours"
                                >
                                  {{
                                    'platform.sessions.duration.hours'
                                      | transloco: { hours: cell.hours }
                                  }}
                                </span>
                                <span class="text-muted-color text-xs" data-testid="cell-days">
                                  {{ cell.hours | duration }}
                                </span>
                                @if (cell.kind === 'fallback') {
                                  <p-tag
                                    class="mt-1"
                                    severity="secondary"
                                    [value]="'platform.sessions.fallbackTag' | transloco"
                                    data-testid="cell-fallback"
                                  />
                                } @else {
                                  <span class="text-muted-color text-xs" data-testid="cell-updated">
                                    @if (cell.policy.updatedBy) {
                                      {{
                                        'platform.sessions.changedOn'
                                          | transloco
                                            : { date: (cell.policy.updatedAt | localDate: lang()) }
                                      }}
                                    } @else {
                                      {{ 'platform.sessions.seeded' | transloco }}
                                    }
                                  </span>
                                }
                              </div>
                              <button
                                *appIfLevel="'super'"
                                type="button"
                                pButton
                                size="small"
                                severity="secondary"
                                [text]="true"
                                class="ml-auto"
                                data-testid="cell-edit"
                                [attr.aria-label]="
                                  'platform.sessions.edit'
                                    | transloco
                                      : {
                                          role: row.role,
                                          client:
                                            ('platform.sessions.clients.' + client | transloco),
                                        }
                                "
                                (click)="edit(row, client, cell)"
                              >
                                <i class="pi pi-pencil" aria-hidden="true"></i>
                              </button>
                            </div>
                          }
                        }
                      </td>
                    }
                  </tr>
                }
              </tbody>
            </table>
          </div>

          <p class="text-muted-color text-xs" data-testid="sessions-shortest">
            {{ 'platform.sessions.shortestNote' | transloco }}
          </p>
        }
      }

      <app-lifetime-dialog
        [(visible)]="dialogOpen"
        [target]="target()"
        [bounds]="bounds()"
        (done)="data.saved($event)"
      />
    </section>
  `,
})
export class TokenLifetimesPage {
  protected readonly data = inject(TokenLifetimesData);
  protected readonly lang = inject(LanguageService).current;

  protected readonly clients = CLIENT_TYPES;
  protected readonly dialogOpen = signal(false);
  protected readonly target = signal<LifetimeTarget | null>(null);

  protected readonly value = computed<TokenLifetimes | null>(() => {
    const state = this.data.state();
    return state.kind === 'ready' ? state.value : null;
  });

  /** The server's bounds; until the read is in, auth's current ones. */
  protected readonly bounds = computed(() => {
    const v = this.value();
    return v ? { minHours: v.minHours, maxHours: v.maxHours } : { minHours: 1, maxHours: 2160 };
  });

  protected edit(row: LifetimeRow, clientType: ClientType, cell: LifetimeCell): void {
    if (cell.kind === 'unused') return;
    this.target.set({
      role: row.role,
      clientType,
      hours: cell.hours,
      isFallback: cell.kind === 'fallback',
    });
    this.dialogOpen.set(true);
  }
}
