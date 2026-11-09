import { Component, OnInit, inject, input, output, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { Button } from 'primeng/button';
import { InputText } from 'primeng/inputtext';
import { FocusOnRender } from '../../shared/focus-on-render.directive';
import { Password } from 'primeng/password';

export interface PasswordSubmit {
  readonly email: string;
  readonly password: string;
}

/** Step 1: email and password. */
@Component({
  selector: 'app-password-step',
  imports: [ReactiveFormsModule, TranslocoPipe, Button, InputText, Password, FocusOnRender],
  template: `
    <form class="flex flex-col gap-4" [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <div class="flex flex-col gap-2">
        <label for="login-email" class="text-sm font-medium">{{ 'login.email' | transloco }}</label>
        <input
          pInputText
          id="login-email"
          type="email"
          formControlName="email"
          autocomplete="username"
          appFocusOnRender
          [invalid]="showErrors() && form.controls.email.invalid"
        />
      </div>
      <div class="flex flex-col gap-2">
        <label for="login-password" class="text-sm font-medium">
          {{ 'login.password' | transloco }}
        </label>
        <p-password
          inputId="login-password"
          formControlName="password"
          autocomplete="current-password"
          [feedback]="false"
          [toggleMask]="true"
          [fluid]="true"
          [invalid]="showErrors() && form.controls.password.invalid"
        />
      </div>
      @if (showErrors() && form.invalid) {
        <small class="text-red-500" data-testid="password-step-invalid">
          {{ 'login.fillBoth' | transloco }}
        </small>
      }
      <p-button
        type="submit"
        [label]="'login.signIn' | transloco"
        [loading]="busy()"
        [fluid]="true"
      />
    </form>
  `,
})
export class PasswordStep implements OnInit {
  private readonly fb = inject(NonNullableFormBuilder);

  readonly email = input('');
  readonly busy = input(false);
  readonly submitted = output<PasswordSubmit>();

  protected readonly showErrors = signal(false);
  protected readonly form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });

  ngOnInit(): void {
    // Coming back from a later step: the email stays, the password does not.
    this.form.controls.email.setValue(this.email());
  }

  protected submit(): void {
    if (this.busy()) return;
    if (this.form.invalid) {
      this.showErrors.set(true);
      return;
    }
    const { email, password } = this.form.getRawValue();
    this.submitted.emit({ email: email.trim(), password });
  }
}
