import { Component, computed, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageSwitcher } from '../../layout/language-switcher';
import { ThemeSwitcher } from '../../layout/theme-switcher';
import { BackupCodesStep } from './backup-codes-step';
import { LoginFlow } from './login-flow';
import { LoginMessageView } from './login-message-view';
import { MfaSetupStep } from './mfa-setup-step';
import { MfaStep } from './mfa-step';
import { PasswordStep, PasswordSubmit } from './password-step';

/** `/login`: password → MFA (or its setup) → the panel. */
@Component({
  selector: 'app-login-page',
  imports: [
    TranslocoPipe,
    LanguageSwitcher,
    ThemeSwitcher,
    LoginMessageView,
    PasswordStep,
    MfaStep,
    MfaSetupStep,
    BackupCodesStep,
  ],
  providers: [LoginFlow],
  template: `
    <main class="flex min-h-dvh flex-col items-center justify-center gap-6 p-4">
      <section
        class="border-border flex w-full max-w-md flex-col gap-5 rounded-xl border p-6 shadow-sm sm:p-8"
        [attr.aria-busy]="flow.busy()"
      >
        <header class="flex flex-col gap-1">
          <p class="text-muted-color text-xs font-medium tracking-wide uppercase">
            {{ 'app.title' | transloco }}
          </p>
          <h1 class="text-xl font-semibold" data-testid="login-title">
            {{ 'login.titles.' + state().step | transloco }}
          </h1>
          @if (flow.email() && state().step !== 'password') {
            <p class="text-muted-color text-sm break-all">{{ flow.email() }}</p>
          }
        </header>

        <app-login-message [message]="flow.message()" />

        @switch (state().step) {
          @case ('password') {
            <app-password-step
              [email]="flow.email()"
              [busy]="flow.busy()"
              (submitted)="signIn($event)"
            />
          }
          @case ('mfa') {
            <app-mfa-step
              [useBackupCode]="useBackupCode()"
              [busy]="flow.busy()"
              (submitted)="flow.submitCode($event)"
              (toggleBackup)="flow.useBackupCode($event)"
              (back)="flow.restart()"
            />
          }
          @case ('setup') {
            <app-mfa-setup-step
              [secret]="setupSecret()"
              [failed]="flow.message() !== null"
              [busy]="flow.busy()"
              (submitted)="flow.confirmSetup($event)"
              (retry)="flow.loadSetupSecret()"
              (back)="flow.restart()"
            />
          }
          @case ('backup-codes') {
            <app-backup-codes-step
              [codes]="backupCodes()"
              [email]="flow.email()"
              [busy]="flow.busy()"
              (done)="flow.finishBackupCodes()"
            />
          }
        }
      </section>

      <div class="flex items-center gap-3">
        <app-language-switcher />
        <app-theme-switcher />
      </div>
    </main>
  `,
})
export class LoginPage {
  protected readonly flow = inject(LoginFlow);
  protected readonly state = this.flow.state;

  protected readonly useBackupCode = computed(() => {
    const s = this.state();
    return s.step === 'mfa' && s.useBackupCode;
  });
  protected readonly setupSecret = computed(() => {
    const s = this.state();
    return s.step === 'setup' ? s.secret : null;
  });
  protected readonly backupCodes = computed(() => {
    const s = this.state();
    return s.step === 'backup-codes' ? s.codes : [];
  });

  protected signIn({ email, password }: PasswordSubmit): void {
    void this.flow.submitPassword(email, password);
  }
}
