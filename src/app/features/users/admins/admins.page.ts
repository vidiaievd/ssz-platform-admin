import { Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { ButtonDirective } from 'primeng/button';
import { Skeleton } from 'primeng/skeleton';
import { Tag } from 'primeng/tag';
import { AdminEntry, AdminsApi } from '../../../core/auth/admins.api';
import { ApiError } from '../../../core/auth/api-error';
import { SessionStore } from '../../../core/auth/session.store';
import { LanguageService } from '../../../core/i18n/language.service';
import { LevelBadge } from '../../../layout/level-badge';
import { formatMoment } from '../../schools/card/journal/journal-format';
import { userTabLink } from '../card/user-tabs';
import { AdminLevelDialog, AdminLevelResult, AdminLevelTarget } from './admin-level-dialog';

const SKELETON_ROWS = [0, 1, 2];

/**
 * `/users/admins` — who may use the panel and at which level (plan 90, phase 6, step 9), `super`
 * only (the route does not match below it, and auth's `SuperAdmin` refuses anyway). Highest level
 * first, as auth lists them; who granted a level is shown by e-mail when that person is still an
 * administrator, else by id — each links to the user card. Change a level or remove it through
 * the level dialog; one's own row has neither (the server refuses `ADMIN_SELF_CHANGE`). A new
 * administrator is made from the user card ("Make administrator").
 */
@Component({
  selector: 'app-admins-page',
  imports: [
    RouterLink,
    TranslocoPipe,
    ButtonDirective,
    Skeleton,
    Tag,
    LevelBadge,
    AdminLevelDialog,
  ],
  template: `
    <section class="flex flex-col gap-4">
      <a class="text-primary flex w-fit items-center gap-1 text-sm" routerLink="/users">
        <i class="pi pi-arrow-left" aria-hidden="true"></i>
        {{ 'users.card.backToList' | transloco }}
      </a>

      <div class="flex flex-wrap items-baseline justify-between gap-2">
        <h1 class="text-2xl font-semibold" data-testid="page-title">
          {{ 'users.admins.title' | transloco }}
        </h1>
        @if (admins(); as list) {
          <span class="text-muted-color text-sm" data-testid="admins-total">
            {{ 'users.admins.total' | transloco: { count: list.length } }}
          </span>
        }
      </div>
      <p class="text-muted-color max-w-3xl text-sm" data-testid="admins-hint">
        {{ 'users.admins.hint' | transloco }}
        <a class="text-primary hover:underline" routerLink="/users">
          {{ 'users.admins.findUser' | transloco }}
        </a>
      </p>

      @if (notice(); as n) {
        <p
          class="flex items-center gap-2 rounded-md border border-sky-300 px-3 py-2 text-sm dark:border-sky-800"
          role="status"
          data-testid="admins-notice"
        >
          <i class="pi pi-check-circle" aria-hidden="true"></i>
          {{ n }}
          <button type="button" class="text-primary ml-auto underline" (click)="notice.set(null)">
            {{ 'users.actions.dismiss' | transloco }}
          </button>
        </p>
      }

      @if (error(); as error) {
        <div
          role="alert"
          class="flex max-w-2xl flex-wrap items-center gap-3 rounded-md border border-red-300 px-3 py-2 text-sm dark:border-red-800"
          data-testid="admins-error"
        >
          <i class="pi pi-exclamation-triangle text-red-500" aria-hidden="true"></i>
          <span>{{ errorKey(error) | transloco }}</span>
          <button pButton type="button" size="small" [outlined]="true" (click)="reload()">
            {{ 'users.retry' | transloco }}
          </button>
        </div>
      } @else {
        <div class="relative overflow-x-auto">
          <table class="w-full min-w-[48rem] text-left text-sm" data-testid="admins-table">
            <thead class="text-muted-color">
              <tr>
                <th class="py-2 pr-4 font-medium">{{ 'users.columns.email' | transloco }}</th>
                <th class="py-2 pr-4 font-medium">{{ 'users.card.account.level' | transloco }}</th>
                <th class="py-2 pr-4 font-medium">{{ 'users.admins.columns.mfa' | transloco }}</th>
                <th class="py-2 pr-4 font-medium">
                  {{ 'users.admins.columns.grantedAt' | transloco }}
                </th>
                <th class="py-2 pr-4 font-medium">
                  {{ 'users.admins.columns.grantedBy' | transloco }}
                </th>
                <th class="py-2 font-medium">
                  <span class="sr-only">{{ 'schools.plan.actions' | transloco }}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              @if (admins(); as list) {
                @for (a of list; track a.userId) {
                  <tr
                    class="border-border border-t align-middle"
                    [attr.data-testid]="'admin-' + a.userId"
                  >
                    <td class="py-2 pr-4 break-all">
                      <a class="text-primary hover:underline" [routerLink]="userLink(a.userId)">
                        {{ a.email }}
                      </a>
                      @if (isSelf(a)) {
                        <p-tag
                          class="ml-2"
                          severity="secondary"
                          [value]="'users.admins.you' | transloco"
                          data-testid="admin-self"
                        />
                      }
                    </td>
                    <td class="py-2 pr-4"><app-level-badge [level]="a.level" /></td>
                    <td class="py-2 pr-4" data-testid="admin-mfa">
                      @if (a.twoFactorEnabled) {
                        {{ 'users.card.access.mfaOn' | transloco }}
                      } @else {
                        <span class="text-amber-700 dark:text-amber-300">
                          {{ 'users.admins.mfaPending' | transloco }}
                        </span>
                      }
                    </td>
                    <td class="py-2 pr-4 text-xs tabular-nums">{{ moment(a.grantedAt) }}</td>
                    <td class="py-2 pr-4 text-xs" data-testid="admin-granted-by">
                      @if (a.grantedBy; as by) {
                        <a
                          class="text-primary hover:underline"
                          [class.font-mono]="!emailOf(by)"
                          [routerLink]="userLink(by)"
                          >{{ emailOf(by) ?? by }}</a
                        >
                      } @else {
                        <span class="text-muted-color">{{
                          'users.admins.bootstrap' | transloco
                        }}</span>
                      }
                    </td>
                    <td class="py-2 text-right whitespace-nowrap">
                      @if (!isSelf(a)) {
                        <button
                          pButton
                          type="button"
                          size="small"
                          severity="secondary"
                          [text]="true"
                          data-testid="admin-change"
                          (click)="open(a, 'set')"
                        >
                          {{ 'users.admins.change.button' | transloco }}
                        </button>
                        <button
                          pButton
                          type="button"
                          size="small"
                          severity="danger"
                          [text]="true"
                          data-testid="admin-revoke"
                          (click)="open(a, 'revoke')"
                        >
                          {{ 'users.admins.revoke.button' | transloco }}
                        </button>
                      }
                    </td>
                  </tr>
                }
              } @else {
                @for (i of skeletonRows; track i) {
                  <tr class="border-border border-t" data-testid="admins-skeleton">
                    <td class="py-2 pr-4" colspan="6"><p-skeleton height="1.5rem" /></td>
                  </tr>
                }
              }
            </tbody>
          </table>
        </div>
      }

      <app-admin-level-dialog [(target)]="target" (done)="afterChange($event)" />
    </section>
  `,
})
export class AdminsPage {
  private readonly api = inject(AdminsApi);
  private readonly session = inject(SessionStore);
  private readonly lang = inject(LanguageService).current;
  private readonly transloco = inject(TranslocoService);

  protected readonly skeletonRows = SKELETON_ROWS;
  protected readonly target = signal<AdminLevelTarget | null>(null);
  /** What the last change did, in words. */
  protected readonly notice = signal<string | null>(null);

  private readonly list = rxResource({ stream: () => this.api.list() });

  protected readonly admins = computed(() => (this.list.hasValue() ? this.list.value() : null));
  protected readonly error = computed(() => {
    const error = this.list.error();
    return error ? ApiError.from(error) : null;
  });
  private readonly emails = computed(
    () => new Map((this.admins() ?? []).map((a) => [a.userId, a.email])),
  );

  protected readonly userLink = (id: string) => userTabLink(id);

  protected isSelf(a: AdminEntry): boolean {
    return a.userId === this.session.claims()?.userId;
  }

  protected emailOf(userId: string): string | null {
    return this.emails().get(userId) ?? null;
  }

  protected open(a: AdminEntry, mode: AdminLevelTarget['mode']): void {
    this.notice.set(null);
    this.target.set({
      mode,
      userId: a.userId,
      email: a.email,
      current: a.level,
      twoFactorEnabled: a.twoFactorEnabled,
    });
  }

  /** The list is read again: a change of one row can move it (highest level first). */
  protected afterChange(result: AdminLevelResult): void {
    this.notice.set(this.noticeOf(result));
    this.list.reload();
  }

  protected reload(): void {
    this.list.reload();
  }

  protected moment(iso: string): string {
    return formatMoment(iso, this.lang());
  }

  protected errorKey(error: ApiError): string {
    if (error.isNetworkError) return 'users.errors.network';
    if (error.status === 403) return 'users.admins.errors.forbidden';
    return 'users.admins.errors.generic';
  }

  private noticeOf(result: AdminLevelResult): string {
    if (result.mode === 'set') {
      return this.transloco.translate('users.admins.notice.set', {
        email: result.entry.email,
        level: this.transloco.translate(`level.${result.entry.level}`),
      });
    }
    const email = this.emailOf(result.userId) ?? result.userId;
    return this.transloco.translate('users.admins.notice.revoked', { email });
  }
}
