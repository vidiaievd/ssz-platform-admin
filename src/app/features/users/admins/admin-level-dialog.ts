import { Component, computed, effect, inject, model, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Select } from 'primeng/select';
import { Observable, map } from 'rxjs';
import { ADMIN_LEVELS, AdminLevel } from '../../../core/auth/admin-level';
import { AdminEntry, AdminsApi } from '../../../core/auth/admins.api';
import { ReasonDialog } from '../../../shared/reason-dialog/reason-dialog';

/** The account a level change is about, as the admins list or the user card knows it. */
export interface AdminLevelTarget {
  /** `set` grants a level or changes it; `revoke` takes the role and level away. */
  readonly mode: 'set' | 'revoke';
  readonly userId: string;
  readonly email: string;
  /** The level now; null for an account that is not an administrator yet. */
  readonly current: AdminLevel | null;
  /** Without it the new administrator is asked to set two-factor sign-in up at the first panel sign-in. */
  readonly twoFactorEnabled: boolean;
}

/** What the server agreed to: the entry as it is now, or the removal. */
export type AdminLevelResult =
  | { readonly mode: 'set'; readonly entry: AdminEntry }
  | { readonly mode: 'revoke'; readonly userId: string };

/** Refusals of `auth/admin/admins` that share a 400 and need their own words. */
const REFUSAL_CODES = ['ADMIN_SELF_CHANGE', 'ADMIN_LAST_SUPER', 'ADMIN_NOT_FOUND'] as const;

/**
 * Grant, change or take away an administrator's level (plan 90, phase 6, step 9) — `super` only,
 * as the server's `SuperAdmin` policy. Granting and changing pick a level different from the
 * current one (the same level again would change nothing); removing ends the person's panel
 * sessions, web sessions stay. The refusals are the server's: one's own level
 * (`ADMIN_SELF_CHANGE`), the last super who can sign in (`ADMIN_LAST_SUPER`), someone who is no
 * longer an administrator (`ADMIN_NOT_FOUND`) — each with its own words inside the dialog.
 */
@Component({
  selector: 'app-admin-level-dialog',
  imports: [FormsModule, TranslocoPipe, Select, ReasonDialog],
  template: `
    <app-reason-dialog
      [visible]="target() !== null"
      (visibleChange)="$event || target.set(null)"
      [header]="key('title') | transloco"
      [confirmLabel]="key('confirm') | transloco"
      level="super"
      [danger]="target()?.mode === 'revoke'"
      [ready]="ready()"
      [action]="run"
      [codeText]="codeText()"
      [(attempted)]="attempted"
      (done)="done.emit($event)"
    >
      @if (target(); as t) {
        <p class="text-sm" data-testid="admin-level-text">
          {{ key('text') | transloco: { email: t.email, level: currentName() } }}
        </p>
        @if (t.mode === 'set') {
          <div class="flex flex-col gap-1">
            <label class="field-required text-sm font-medium" for="admin-level-select">
              {{ 'users.admins.dialog.level' | transloco }}
            </label>
            <p-select
              inputId="admin-level-select"
              class="w-full"
              appendTo="body"
              [options]="options()"
              optionLabel="label"
              optionValue="level"
              [ngModel]="level()"
              (ngModelChange)="level.set($event)"
              [ngModelOptions]="{ standalone: true }"
              [placeholder]="'users.admins.dialog.pickLevel' | transloco"
              [invalid]="levelMissing()"
              data-testid="admin-level-select"
            />
            @if (levelMissing()) {
              <span
                class="text-xs text-red-600 dark:text-red-400"
                data-testid="admin-level-required"
              >
                {{ 'reasonDialog.fieldRequired' | transloco }}
              </span>
            } @else if (level(); as picked) {
              <span class="text-muted-color text-xs" data-testid="admin-level-scope">
                {{ 'users.admins.scope.' + picked | transloco }}
              </span>
            }
          </div>
          @if (!t.twoFactorEnabled) {
            <p
              class="flex items-start gap-2 rounded-md border border-amber-300 px-3 py-2 text-xs dark:border-amber-800"
              data-testid="admin-level-no-mfa"
            >
              <i class="pi pi-shield mt-0.5" aria-hidden="true"></i>
              {{ 'users.admins.dialog.noMfa' | transloco }}
            </p>
          }
        }
      }
    </app-reason-dialog>
  `,
})
export class AdminLevelDialog {
  /** The open dialog's account; null closes it. */
  readonly target = model<AdminLevelTarget | null>(null);
  readonly done = output<AdminLevelResult>();

  private readonly api = inject(AdminsApi);
  private readonly transloco = inject(TranslocoService);

  protected readonly level = signal<AdminLevel | null>(null);
  protected readonly attempted = signal(false);

  /** Highest first, as the server lists administrators; the current level is not offered. */
  protected readonly options = computed(() => {
    const current = this.target()?.current ?? null;
    return [...ADMIN_LEVELS]
      .reverse()
      .filter((level) => level !== current)
      .map((level) => ({ level, label: this.transloco.translate(`level.${level}`) }));
  });
  protected readonly levelMissing = computed(
    () => this.target()?.mode === 'set' && this.attempted() && this.level() === null,
  );
  protected readonly ready = computed(() => this.target()?.mode === 'revoke' || !!this.level());
  protected readonly currentName = computed(() => {
    const current = this.target()?.current;
    return current ? this.transloco.translate(`level.${current}`) : '';
  });
  protected readonly codeText = computed(() =>
    Object.fromEntries(
      REFUSAL_CODES.map((code) => [code, this.transloco.translate(`users.admins.errors.${code}`)]),
    ),
  );

  constructor() {
    // Each opening starts with no level picked.
    effect(() => {
      this.target();
      this.level.set(null);
    });
  }

  /** `users.admins.<grant|change|revoke>.<part>`. */
  protected key(part: 'title' | 'confirm' | 'text'): string {
    const t = this.target();
    const kind = t?.mode === 'revoke' ? 'revoke' : t?.current ? 'change' : 'grant';
    return `users.admins.${kind}.${part}`;
  }

  protected readonly run = (reason: string): Observable<AdminLevelResult> => {
    const t = this.target()!;
    if (t.mode === 'revoke') {
      return this.api
        .revoke(t.userId, reason)
        .pipe(map((): AdminLevelResult => ({ mode: 'revoke', userId: t.userId })));
    }
    return this.api
      .set(t.userId, this.level()!, reason)
      .pipe(map((entry): AdminLevelResult => ({ mode: 'set', entry })));
  };
}
