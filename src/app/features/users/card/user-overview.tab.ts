import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { ButtonDirective } from 'primeng/button';
import { Tag } from 'primeng/tag';
import { AdminLevel } from '../../../core/auth/admin-level';
import { AdminUserDetail, AdminUsersApi } from '../../../core/auth/admin-users.api';
import { IfLevelDirective } from '../../../core/auth/if-level.directive';
import { SessionStore } from '../../../core/auth/session.store';
import { LanguageService } from '../../../core/i18n/language.service';
import { LocalDatePipe } from '../../../shared/local-date.pipe';
import { ActionErrorKey } from '../../../shared/reason-dialog/action-error';
import { ReasonDialog } from '../../../shared/reason-dialog/reason-dialog';
import { formatMoment } from '../../schools/card/journal/journal-format';
import { daysUntil } from '../../schools/school-lifecycle';
import { roleKey } from '../user-roles';
import {
  UserAction,
  UserActionKind,
  UserActionResult,
  actionLevel,
  applicableActions,
  nothingToChangeAsReread,
} from './user-actions';
import { UserCardData } from './user-card.data';
import { userTabLink } from './user-tabs';

/**
 * Overview tab of the user card (plan 90, phase 6, step 7): the account (roles, level, dates),
 * access (an administrator's block, the lockout after failed sign-ins, two-factor sign-in and its
 * code lockout), sessions by client and a pending deletion with its erasure date — all from
 * auth's card, read once by the card page. Never a hash, a secret or a code.
 *
 * Actions (step 8) sit beside the state they change: block / unblock, lift the lockout, reset
 * two-factor sign-in, end sessions (one client or all), withdraw a deletion request. A button is
 * drawn only when the action would change something (`applicableActions`) and the level allows it
 * on this account (`actionLevel`: a platform administrator's account asks for `super` to block,
 * unblock or reset MFA); never on one's own account. Each goes through the reason dialog and the
 * answer is the card as it is now. A 409 `NOTHING_TO_CHANGE` is no error: the card is read again
 * and a note says nothing changed.
 */
@Component({
  selector: 'app-user-overview-tab',
  imports: [
    RouterLink,
    TranslocoPipe,
    ButtonDirective,
    Tag,
    IfLevelDirective,
    LocalDatePipe,
    ReasonDialog,
  ],
  template: `
    @if (data.user(); as user) {
      @if (self()) {
        <p
          class="mb-4 flex items-center gap-2 rounded-md border border-sky-300 px-3 py-2 text-sm dark:border-sky-800"
          data-testid="user-self"
        >
          <i class="pi pi-info-circle" aria-hidden="true"></i>
          {{ 'users.actions.self' | transloco }}
        </p>
      }
      @if (notice()) {
        <p
          class="mb-4 flex items-center gap-2 rounded-md border border-sky-300 px-3 py-2 text-sm dark:border-sky-800"
          role="status"
          data-testid="user-nothing-changed"
        >
          <i class="pi pi-info-circle" aria-hidden="true"></i>
          {{ 'users.actions.nothingChanged' | transloco }}
          <button
            type="button"
            class="text-primary ml-auto underline"
            data-testid="user-nothing-changed-close"
            (click)="notice.set(false)"
          >
            {{ 'users.actions.dismiss' | transloco }}
          </button>
        </p>
      }
      <div class="grid gap-4 lg:grid-cols-2" data-testid="user-overview">
        <!-- Account -->
        <section
          class="border-border flex flex-col gap-3 rounded-md border p-4"
          data-testid="overview-account"
        >
          <h2 class="text-base font-semibold">{{ 'users.card.account.title' | transloco }}</h2>
          <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt class="text-muted-color">{{ 'users.columns.email' | transloco }}</dt>
            <dd class="flex flex-wrap items-center gap-2 break-all">
              {{ user.email }}
              @if (!user.emailVerified) {
                <p-tag severity="secondary" [value]="'users.badge.unverified' | transloco" />
              }
            </dd>
            <dt class="text-muted-color">{{ 'users.columns.roles' | transloco }}</dt>
            <dd data-testid="account-roles">
              @for (role of user.roles; track role; let last = $last) {
                {{ roleKey(role) | transloco }}{{ last ? '' : ', ' }}
              } @empty {
                {{ 'users.card.noRoles' | transloco }}
              }
            </dd>
            <dt class="text-muted-color">{{ 'users.card.account.level' | transloco }}</dt>
            <dd data-testid="account-level">
              {{ user.adminLevel ? ('level.' + user.adminLevel | transloco) : '—' }}
            </dd>
            <dt class="text-muted-color">{{ 'users.columns.createdAt' | transloco }}</dt>
            <dd>{{ user.createdAt | localDate: lang() }}</dd>
            <dt class="text-muted-color">{{ 'users.columns.lastLoginAt' | transloco }}</dt>
            <dd data-testid="account-last-login">
              {{
                user.lastLoginAt ? moment(user.lastLoginAt) : ('users.neverSignedIn' | transloco)
              }}
            </dd>
            <dt class="text-muted-color">ID</dt>
            <dd class="font-mono text-xs break-all">{{ user.id }}</dd>
          </dl>
        </section>

        <!-- Access -->
        <section
          class="border-border flex flex-col gap-3 rounded-md border p-4"
          data-testid="overview-access"
        >
          <h2 class="text-base font-semibold">{{ 'users.card.access.title' | transloco }}</h2>

          <div class="flex flex-col gap-1 text-sm" data-testid="access-block">
            <h3 class="font-medium">{{ 'users.card.access.block' | transloco }}</h3>
            @if (user.block; as block) {
              <p class="text-red-700 dark:text-red-300" data-testid="access-blocked">
                {{ 'users.card.access.blockedAt' | transloco: { at: moment(block.at) } }}
              </p>
              <p class="text-muted-color text-xs">
                {{ 'users.card.access.blockedBy' | transloco }}:
                @if (block.by; as by) {
                  <a
                    class="text-primary font-mono hover:underline"
                    [routerLink]="userLink(by)"
                    data-testid="access-blocked-by"
                    >{{ by }}</a
                  >
                } @else {
                  —
                }
              </p>
              @if (block.reason) {
                <p class="text-xs" data-testid="access-block-reason">
                  {{ 'users.card.access.blockReason' | transloco: { reason: block.reason } }}
                </p>
              }
            } @else {
              <p class="text-muted-color" data-testid="access-not-blocked">
                {{ 'users.card.access.notBlocked' | transloco }}
              </p>
            }
            @if (offer('block')) {
              <button
                *appIfLevel="levelOf('block')"
                pButton
                type="button"
                size="small"
                severity="danger"
                [outlined]="true"
                class="w-fit"
                data-testid="action-block"
                (click)="start({ kind: 'block' })"
              >
                <i class="pi pi-ban" aria-hidden="true"></i>
                {{ 'users.actions.block.button' | transloco }}
              </button>
            }
            @if (offer('unblock')) {
              <button
                *appIfLevel="levelOf('unblock')"
                pButton
                type="button"
                size="small"
                [outlined]="true"
                class="w-fit"
                data-testid="action-unblock"
                (click)="start({ kind: 'unblock' })"
              >
                <i class="pi pi-lock-open" aria-hidden="true"></i>
                {{ 'users.actions.unblock.button' | transloco }}
              </button>
            }
          </div>

          <div class="flex flex-col gap-1 text-sm" data-testid="access-lockout">
            <h3 class="font-medium">{{ 'users.card.access.signIns' | transloco }}</h3>
            <p>
              {{ 'users.card.access.failedLogins' | transloco: { n: user.failedLogins.count } }}
              @if (user.failedLogins.lastAt; as lastAt) {
                <span class="text-muted-color text-xs">
                  · {{ 'users.card.access.lastFailed' | transloco: { at: moment(lastAt) } }}
                </span>
              }
            </p>
            @if (lockedUntil(); as until) {
              <p class="text-amber-700 dark:text-amber-300" data-testid="access-locked">
                {{ 'users.card.access.lockedUntil' | transloco: { at: moment(until) } }}
              </p>
            }
            <p class="text-muted-color text-xs">{{ 'users.actions.unlock.where' | transloco }}</p>
            @if (offer('unlock')) {
              <button
                *appIfLevel="levelOf('unlock')"
                pButton
                type="button"
                size="small"
                [outlined]="true"
                class="w-fit"
                data-testid="action-unlock"
                (click)="start({ kind: 'unlock' })"
              >
                <i class="pi pi-unlock" aria-hidden="true"></i>
                {{ 'users.actions.unlock.button' | transloco }}
              </button>
            }
          </div>

          <div class="flex flex-col gap-1 text-sm" data-testid="access-mfa">
            <h3 class="font-medium">{{ 'users.card.access.mfa' | transloco }}</h3>
            <p data-testid="access-mfa-state">
              {{
                (user.twoFactorEnabled ? 'users.card.access.mfaOn' : 'users.card.access.mfaOff')
                  | transloco
              }}
              @if (user.twoFactorEnabled) {
                <span class="text-muted-color text-xs">
                  · {{ 'users.card.access.backupCodes' | transloco: { n: user.backupCodesLeft } }}
                </span>
              }
            </p>
            @if (!user.mfaCodes.available) {
              <p class="text-muted-color text-xs" data-testid="access-codes-unknown">
                {{ 'users.card.access.codesUnknown' | transloco }}
              </p>
            } @else if (user.mfaCodes.lockedUntil; as until) {
              <p class="text-amber-700 dark:text-amber-300" data-testid="access-codes-locked">
                {{ 'users.card.access.codesLocked' | transloco: { at: moment(until) } }}
              </p>
            } @else if (user.mfaCodes.failures > 0) {
              <p class="text-xs" data-testid="access-codes-failures">
                {{ 'users.card.access.codesFailures' | transloco: { n: user.mfaCodes.failures } }}
              </p>
            }
            @if (offer('resetMfa')) {
              <button
                *appIfLevel="levelOf('resetMfa')"
                pButton
                type="button"
                size="small"
                severity="danger"
                [outlined]="true"
                class="w-fit"
                data-testid="action-resetMfa"
                (click)="start({ kind: 'resetMfa' })"
              >
                <i class="pi pi-shield" aria-hidden="true"></i>
                {{ 'users.actions.resetMfa.button' | transloco }}
              </button>
            }
          </div>
        </section>

        <!-- Sessions -->
        <section
          class="border-border flex flex-col gap-3 rounded-md border p-4 lg:col-span-2"
          data-testid="overview-sessions"
        >
          <div class="flex flex-wrap items-center gap-2">
            <h2 class="text-base font-semibold">{{ 'users.card.sessions.title' | transloco }}</h2>
            <span class="ml-auto"></span>
            @if (offer('revokeSessions')) {
              <button
                *appIfLevel="levelOf('revokeSessions')"
                pButton
                type="button"
                size="small"
                severity="danger"
                [outlined]="true"
                class="w-fit"
                data-testid="action-revoke-all"
                (click)="start({ kind: 'revokeSessions' })"
              >
                <i class="pi pi-sign-out" aria-hidden="true"></i>
                {{ 'users.actions.revokeSessions.buttonAll' | transloco }}
              </button>
            }
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-left text-sm">
              <thead class="text-muted-color">
                <tr>
                  <th class="py-1 pr-4 font-medium">
                    {{ 'users.card.sessions.client' | transloco }}
                  </th>
                  <th class="py-1 pr-4 font-medium">
                    {{ 'users.card.sessions.active' | transloco }}
                  </th>
                  <th class="py-1 pr-4 font-medium">
                    {{ 'users.card.sessions.lastIssued' | transloco }}
                  </th>
                  <th class="py-1 pr-4 font-medium">
                    {{ 'users.card.sessions.recent' | transloco }}
                  </th>
                  <th class="py-1 font-medium">
                    <span class="sr-only">{{ 'schools.plan.actions' | transloco }}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                @for (client of user.sessions; track client.clientType) {
                  <tr
                    class="border-border border-t align-top"
                    [attr.data-testid]="'sessions-' + client.clientType"
                  >
                    <td class="py-2 pr-4">
                      {{ 'platform.sessions.clients.' + client.clientType | transloco }}
                    </td>
                    <td class="py-2 pr-4 tabular-nums" data-testid="sessions-active">
                      {{ client.active }}
                    </td>
                    <td class="py-2 pr-4 text-xs tabular-nums">
                      {{ client.lastIssuedAt ? moment(client.lastIssuedAt) : '—' }}
                    </td>
                    <td class="py-2 pr-4 text-xs">
                      @for (s of client.recent; track $index) {
                        <div>
                          <span class="tabular-nums">{{ moment(s.issuedAt) }}</span>
                          <span class="text-muted-color">
                            · {{ s.deviceInfo ?? ('users.card.sessions.noDevice' | transloco) }}
                          </span>
                        </div>
                      } @empty {
                        <span class="text-muted-color">—</span>
                      }
                    </td>
                    <td class="py-2 text-right">
                      @if (client.active > 0 && !self()) {
                        <button
                          *appIfLevel="levelOf('revokeSessions')"
                          pButton
                          type="button"
                          size="small"
                          severity="secondary"
                          [text]="true"
                          data-testid="action-revoke-client"
                          (click)="start({ kind: 'revokeSessions', clientType: client.clientType })"
                        >
                          {{ 'users.actions.revokeSessions.button' | transloco }}
                        </button>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <p class="text-muted-color text-xs">{{ 'users.card.sessions.hint' | transloco }}</p>
        </section>

        <!-- Deletion request (plan 07) -->
        @if (user.deletionRequestedAt; as requestedAt) {
          <section
            class="flex flex-col gap-2 rounded-md border border-amber-300 p-4 lg:col-span-2 dark:border-amber-800"
            data-testid="overview-deletion"
          >
            <h2 class="text-base font-semibold">{{ 'users.card.deletion.title' | transloco }}</h2>
            <p class="text-sm">
              {{
                'users.card.deletion.requestedAt'
                  | transloco: { date: (requestedAt | localDate: lang()) }
              }}
            </p>
            @if (user.purgeAt; as purgeAt) {
              <p class="text-sm font-medium" data-testid="deletion-purge-at">
                {{
                  'users.card.deletion.purgeAt'
                    | transloco: { date: (purgeAt | localDate: lang()), n: days(purgeAt) }
                }}
              </p>
            }
            <p class="text-muted-color text-xs">{{ 'users.card.deletion.hint' | transloco }}</p>
            @if (offer('cancelDeletion')) {
              <button
                *appIfLevel="levelOf('cancelDeletion')"
                pButton
                type="button"
                size="small"
                [outlined]="true"
                class="w-fit"
                data-testid="action-cancelDeletion"
                (click)="start({ kind: 'cancelDeletion' })"
              >
                <i class="pi pi-undo" aria-hidden="true"></i>
                {{ 'users.actions.cancelDeletion.button' | transloco }}
              </button>
            }
          </section>
        }
      </div>

      <app-reason-dialog
        [visible]="pending() !== null"
        (visibleChange)="$event || pending.set(null)"
        [header]="dialogKey('title') | transloco: { client: pendingClient() }"
        [confirmLabel]="dialogKey('confirm') | transloco"
        [level]="pendingLevel()"
        [danger]="pendingDanger()"
        [action]="run"
        [errorText]="errorText()"
        (done)="afterAction($event)"
      >
        <p class="text-sm" data-testid="action-text">
          {{ dialogKey('text') | transloco: { email: user.email, client: pendingClient() } }}
        </p>
      </app-reason-dialog>
    }
  `,
})
export class UserOverviewTab {
  protected readonly data = inject(UserCardData);
  protected readonly lang = inject(LanguageService).current;
  protected readonly roleKey = roleKey;
  protected readonly userLink = (id: string) => userTabLink(id);

  /** The sign-in lockout, only while it runs (a card read a while ago is checked against the clock). */
  protected readonly lockedUntil = computed(() => runningUntil(this.data.user()));

  private readonly api = inject(AdminUsersApi);
  private readonly session = inject(SessionStore);
  private readonly transloco = inject(TranslocoService);

  /** The administrator's own account: the server refuses every action (`ADMIN_SELF_CHANGE`). */
  protected readonly self = computed(() => this.data.user()?.id === this.session.claims()?.userId);
  private readonly applicable = computed(() => {
    const user = this.data.user();
    return user ? applicableActions(user) : new Set<UserActionKind>();
  });
  /** The action whose dialog is open. */
  protected readonly pending = signal<UserAction | null>(null);
  /** The last action changed nothing: the card was read again. */
  protected readonly notice = signal(false);

  protected readonly pendingLevel = computed<AdminLevel>(() => {
    const p = this.pending();
    const user = this.data.user();
    return p && user ? actionLevel(p.kind, user) : 'super';
  });
  protected readonly pendingDanger = computed(() => {
    const kind = this.pending()?.kind;
    return kind === 'block' || kind === 'resetMfa' || kind === 'revokeSessions';
  });
  /** The client's name for "end sessions" of one client; empty for all of them. */
  protected readonly pendingClient = computed(() => {
    const client = this.pending()?.clientType;
    return client ? this.transloco.translate(`platform.sessions.clients.${client}`) : '';
  });
  /** The refusals an action has its own words for; the code is shown under them anyway. */
  protected readonly errorText = computed<Partial<Record<ActionErrorKey, string>>>(() => {
    switch (this.pending()?.kind) {
      case 'block':
        return { invalid: this.transloco.translate('users.actions.errors.lastSuper') };
      case 'unlock':
        return { unavailable: this.transloco.translate('users.actions.errors.lockoutStore') };
      default:
        return {};
    }
  });

  protected offer(kind: UserActionKind): boolean {
    return !this.self() && this.applicable().has(kind);
  }

  protected levelOf(kind: UserActionKind): AdminLevel {
    const user = this.data.user();
    return user ? actionLevel(kind, user) : 'super';
  }

  protected start(action: UserAction): void {
    this.notice.set(false);
    this.pending.set(action);
  }

  /** `users.actions.<kind>.<part>`; ending one client's sessions has its own words. */
  protected dialogKey(part: 'title' | 'confirm' | 'text'): string {
    const p = this.pending();
    if (!p) return 'users.actions.block.' + part;
    const kind = p.kind === 'revokeSessions' && !p.clientType ? 'revokeAllSessions' : p.kind;
    return `users.actions.${kind}.${part}`;
  }

  protected readonly run = (reason: string) => {
    const p = this.pending()!;
    const id = this.data.userId()!;
    return this.call(p, id, reason).pipe(nothingToChangeAsReread(() => this.api.get(id)));
  };

  protected afterAction(result: UserActionResult): void {
    this.data.setUser(result.user);
    this.notice.set(result.nothingChanged);
  }

  private call(p: UserAction, id: string, reason: string) {
    switch (p.kind) {
      case 'block':
        return this.api.block(id, reason);
      case 'unblock':
        return this.api.unblock(id, reason);
      case 'unlock':
        return this.api.unlock(id, reason);
      case 'revokeSessions':
        return this.api.revokeSessions(id, reason, p.clientType);
      case 'resetMfa':
        return this.api.resetMfa(id, reason);
      case 'cancelDeletion':
        return this.api.cancelDeletion(id, reason);
    }
  }

  protected moment(iso: string): string {
    return formatMoment(iso, this.lang());
  }

  protected days(iso: string): number {
    return daysUntil(iso);
  }
}

function runningUntil(user: AdminUserDetail | undefined, now: Date = new Date()): string | null {
  const until = user?.failedLogins.lockedUntil ?? null;
  return until && new Date(until).getTime() > now.getTime() ? until : null;
}
