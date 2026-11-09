import { Component, effect, inject, input, output, signal, untracked } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { Button } from 'primeng/button';
import { InputText } from 'primeng/inputtext';
import { FocusOnRender } from '../../shared/focus-on-render.directive';
import { backupCodeValidator, cleanTotpCode, totpCodeValidator } from './code-field';

/** Step 2: the authenticator code, or a one-time backup code instead. */
@Component({
  selector: 'app-mfa-step',
  imports: [ReactiveFormsModule, TranslocoPipe, Button, InputText, FocusOnRender],
  template: `
    <form class="flex flex-col gap-4" [formGroup]="form" (ngSubmit)="submit()" novalidate>
      @if (useBackupCode()) {
        <p class="text-muted-color text-sm">{{ 'login.mfa.backupHint' | transloco }}</p>
        <div class="flex flex-col gap-2">
          <label for="login-backup-code" class="text-sm font-medium">
            {{ 'login.mfa.backupCode' | transloco }}
          </label>
          <input
            pInputText
            id="login-backup-code"
            [formControl]="backupCode"
            autocomplete="off"
            autocapitalize="characters"
            spellcheck="false"
            placeholder="XXXXXXXX-XXXX"
            maxlength="20"
            class="font-mono tracking-wider"
            appFocusOnRender
            [invalid]="showErrors() && backupCode.invalid"
          />
        </div>
      } @else {
        <p class="text-muted-color text-sm">{{ 'login.mfa.codeHint' | transloco }}</p>
        <div class="flex flex-col gap-2">
          <label for="login-code" class="text-sm font-medium">
            {{ 'login.mfa.code' | transloco }}
          </label>
          <input
            pInputText
            id="login-code"
            [formControl]="code"
            inputmode="numeric"
            autocomplete="one-time-code"
            placeholder="123456"
            maxlength="7"
            class="font-mono text-lg tracking-[0.3em]"
            appFocusOnRender
            [invalid]="showErrors() && code.invalid"
          />
        </div>
      }
      @if (showErrors() && (useBackupCode() ? backupCode.invalid : code.invalid)) {
        <small class="text-red-500" data-testid="mfa-step-invalid">
          {{ (useBackupCode() ? 'login.mfa.backupFormat' : 'login.codeFormat') | transloco }}
        </small>
      }
      <p-button
        type="submit"
        [label]="'login.mfa.verify' | transloco"
        [loading]="busy()"
        [fluid]="true"
      />
      <div class="flex items-center justify-between gap-2 text-sm">
        <p-button
          [link]="true"
          size="small"
          icon="pi pi-arrow-left"
          [label]="'login.back' | transloco"
          (onClick)="back.emit()"
        />
        <p-button
          [link]="true"
          size="small"
          data-testid="toggle-backup"
          [label]="
            (useBackupCode() ? 'login.mfa.useAuthenticator' : 'login.mfa.useBackup') | transloco
          "
          (onClick)="toggleBackup.emit(!useBackupCode())"
        />
      </div>
    </form>
  `,
})
export class MfaStep {
  private readonly fb = inject(NonNullableFormBuilder);

  readonly useBackupCode = input(false);
  readonly busy = input(false);
  readonly submitted = output<string>();
  readonly toggleBackup = output<boolean>();
  readonly back = output<void>();

  protected readonly showErrors = signal(false);
  protected readonly code = this.fb.control('', totpCodeValidator);
  protected readonly backupCode = this.fb.control('', backupCodeValidator);
  /** Only so the form has a directive that emits ngSubmit; each control is checked alone. */
  protected readonly form = this.fb.group({ code: this.code, backupCode: this.backupCode });

  constructor() {
    // Switching modes starts the field fresh.
    effect(() => {
      this.useBackupCode();
      untracked(() => this.showErrors.set(false));
    });
  }

  protected submit(): void {
    if (this.busy()) return;
    const control = this.useBackupCode() ? this.backupCode : this.code;
    if (control.invalid) {
      this.showErrors.set(true);
      return;
    }
    this.submitted.emit(this.useBackupCode() ? control.value : cleanTotpCode(control.value));
    // A code is good once: a failed one is cleared for the next try.
    control.reset();
    this.showErrors.set(false);
  }
}
