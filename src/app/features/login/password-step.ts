import { Component, OnInit, inject, input, output, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { ButtonDirective } from 'primeng/button';
import { IconField } from 'primeng/iconfield';
import { InputIcon } from 'primeng/inputicon';
import { InputPassword } from 'primeng/inputpassword';
import { InputText } from 'primeng/inputtext';
import { FocusOnRender } from '../../shared/focus-on-render.directive';

export interface PasswordSubmit {
  readonly email: string;
  readonly password: string;
}

/** Step 1: email and password. */
@Component({
  selector: 'app-password-step',
  imports: [
    ReactiveFormsModule,
    TranslocoPipe,
    ButtonDirective,
    InputText,
    InputPassword,
    IconField,
    InputIcon,
    FocusOnRender,
  ],
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
        <p-iconfield>
          <input
            pInputPassword
            id="login-password"
            formControlName="password"
            autocomplete="current-password"
            [(mask)]="masked"
            [fluid]="true"
            [invalid]="showErrors() && form.controls.password.invalid"
          />
          <p-inputicon>
            <button
              type="button"
              class="flex cursor-pointer"
              data-testid="toggle-password"
              [attr.aria-label]="'login.showPassword' | transloco"
              [attr.aria-pressed]="!masked()"
              (click)="masked.set(!masked())"
            >
              <i [class]="masked() ? 'pi pi-eye' : 'pi pi-eye-slash'" aria-hidden="true"></i>
            </button>
          </p-inputicon>
        </p-iconfield>
      </div>
      @if (showErrors() && form.invalid) {
        <small class="text-red-500" data-testid="password-step-invalid">
          {{ 'login.fillBoth' | transloco }}
        </small>
      }
      <button pButton type="submit" [fluid]="true" [disabled]="busy()">
        @if (busy()) {
          <i class="pi pi-spin pi-spinner" aria-hidden="true"></i>
        }
        {{ 'login.signIn' | transloco }}
      </button>
    </form>
  `,
})
export class PasswordStep implements OnInit {
  private readonly fb = inject(NonNullableFormBuilder);

  readonly email = input('');
  readonly busy = input(false);
  readonly submitted = output<PasswordSubmit>();

  /** The password is hidden until the eye button shows it. */
  protected readonly masked = signal(true);

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
