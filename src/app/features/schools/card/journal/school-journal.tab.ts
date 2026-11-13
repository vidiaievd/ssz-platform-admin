import { Component, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { ButtonDirective } from 'primeng/button';
import { Skeleton } from 'primeng/skeleton';
import { Tag } from 'primeng/tag';
import { LanguageService } from '../../../../core/i18n/language.service';
import { formatMoment, formatSnapshot, isKnownAction } from './journal-format';
import { SchoolJournalData } from './school-journal.data';

/**
 * "Journal" tab of the school card (plan 90, phase 3, step 11): what admins did with this school
 * — plan changes, grants, payer policy — newest first, with who, when and why. The before and
 * after of each entry unfold on demand. Read only; "more" pages on by the server's cursor.
 */
@Component({
  selector: 'app-school-journal-tab',
  providers: [SchoolJournalData],
  imports: [TranslocoPipe, ButtonDirective, Skeleton, Tag],
  template: `
    <section class="border-border flex flex-col gap-3 rounded-md border p-4" data-testid="journal">
      <h2 class="text-base font-semibold">{{ 'schools.journal.title' | transloco }}</h2>

      @switch (data.state()) {
        @case ('loading') {
          <p-skeleton height="8rem" />
        }
        @case ('error') {
          <p class="text-sm" role="alert" data-testid="journal-failed">
            {{ 'schools.journal.failed' | transloco }} ·
            <button type="button" class="text-primary underline" (click)="data.reload()">
              {{ 'schools.retry' | transloco }}
            </button>
          </p>
        }
        @default {
          @if (data.items().length === 0) {
            <p class="text-muted-color text-sm" data-testid="journal-empty">
              {{ 'schools.journal.empty' | transloco }}
            </p>
          } @else {
            <ol class="flex flex-col" data-testid="journal-list">
              @for (entry of data.items(); track entry.id) {
                <li class="border-border flex flex-col gap-1 border-t py-3 first:border-t-0">
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="font-medium" data-testid="journal-action">
                      {{
                        isKnown(entry.action)
                          ? ('schools.journal.actions.' + entry.action | transloco)
                          : entry.action
                      }}
                    </span>
                    <p-tag severity="secondary" [value]="entry.service" />
                    <time
                      class="text-muted-color ml-auto text-xs tabular-nums"
                      [attr.datetime]="entry.occurredAt"
                      data-testid="journal-time"
                    >
                      {{ moment(entry.occurredAt) }}
                    </time>
                  </div>

                  <div class="text-muted-color flex flex-wrap items-center gap-2 text-xs">
                    <span>{{ 'schools.journal.actor' | transloco }}:</span>
                    @if (entry.actorId) {
                      <span class="font-mono" data-testid="journal-actor">{{ entry.actorId }}</span>
                      @if (entry.actorLevel; as level) {
                        <p-tag severity="info" [value]="level" />
                      }
                    } @else {
                      <span data-testid="journal-actor">{{
                        'schools.journal.system' | transloco
                      }}</span>
                    }
                  </div>

                  @if (entry.reason) {
                    <p class="text-sm" data-testid="journal-reason">
                      {{ 'schools.journal.reason' | transloco: { reason: entry.reason } }}
                    </p>
                  }

                  @if (entry.before !== null || entry.after !== null) {
                    <details class="text-sm" data-testid="journal-details">
                      <summary class="text-primary cursor-pointer">
                        {{ 'schools.journal.changes' | transloco }}
                      </summary>
                      <div class="mt-2 grid gap-3 md:grid-cols-2">
                        <div>
                          <h3 class="text-muted-color mb-1 text-xs font-medium">
                            {{ 'schools.journal.before' | transloco }}
                          </h3>
                          <pre
                            class="bg-surface-100 dark:bg-surface-800 overflow-x-auto rounded-md p-2 text-xs"
                            data-testid="journal-before"
                            >{{ snapshot(entry.before) }}</pre
                          >
                        </div>
                        <div>
                          <h3 class="text-muted-color mb-1 text-xs font-medium">
                            {{ 'schools.journal.after' | transloco }}
                          </h3>
                          <pre
                            class="bg-surface-100 dark:bg-surface-800 overflow-x-auto rounded-md p-2 text-xs"
                            data-testid="journal-after"
                            >{{ snapshot(entry.after) }}</pre
                          >
                        </div>
                      </div>
                    </details>
                  }
                </li>
              }
            </ol>

            @if (data.moreState() === 'error') {
              <p class="text-sm" role="alert" data-testid="journal-more-failed">
                {{ 'schools.journal.moreFailed' | transloco }}
              </p>
            }
            @if (data.nextCursor()) {
              <div>
                <button
                  pButton
                  type="button"
                  severity="secondary"
                  size="small"
                  data-testid="journal-more"
                  [disabled]="data.moreState() === 'loading'"
                  (click)="data.more()"
                >
                  {{
                    (data.moreState() === 'error' ? 'schools.retry' : 'schools.journal.more')
                      | transloco
                  }}
                </button>
              </div>
            }
          }
        }
      }
    </section>
  `,
})
export class SchoolJournalTab {
  protected readonly data = inject(SchoolJournalData);
  private readonly lang = inject(LanguageService).current;

  protected readonly isKnown = isKnownAction;
  protected readonly snapshot = formatSnapshot;

  protected moment(iso: string): string {
    return formatMoment(iso, this.lang());
  }
}
