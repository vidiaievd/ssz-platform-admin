import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Tag } from 'primeng/tag';
import { AdminUserDetail } from '../../../core/auth/admin-users.api';
import { LanguageService } from '../../../core/i18n/language.service';
import { LocalDatePipe } from '../../../shared/local-date.pipe';
import { formatMoment } from '../../schools/card/journal/journal-format';
import { daysUntil } from '../../schools/school-lifecycle';
import { roleKey } from '../user-roles';
import { UserCardData } from './user-card.data';
import { userTabLink } from './user-tabs';

/**
 * Overview tab of the user card (plan 90, phase 6, step 7): the account (roles, level, dates),
 * access (an administrator's block, the lockout after failed sign-ins, two-factor sign-in and its
 * code lockout), sessions by client and a pending deletion with its erasure date — all from
 * auth's card, read once by the card page. Never a hash, a secret or a code.
 */
@Component({
  selector: 'app-user-overview-tab',
  imports: [RouterLink, TranslocoPipe, Tag, LocalDatePipe],
  template: `
    @if (data.user(); as user) {
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
          </div>
        </section>

        <!-- Sessions -->
        <section
          class="border-border flex flex-col gap-3 rounded-md border p-4 lg:col-span-2"
          data-testid="overview-sessions"
        >
          <h2 class="text-base font-semibold">{{ 'users.card.sessions.title' | transloco }}</h2>
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
          </section>
        }
      </div>
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
