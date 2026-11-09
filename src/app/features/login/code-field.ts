import { AbstractControl, ValidationErrors } from '@angular/forms';

/** A six-digit authenticator code; spaces are allowed (some apps show `123 456`). */
export function totpCodeValidator(control: AbstractControl<string>): ValidationErrors | null {
  return /^\d{6}$/.test(control.value.replace(/\s+/g, '')) ? null : { totpCode: true };
}

/** A backup code `XXXXXXXX-XXXX`, any case, spaces allowed. */
export function backupCodeValidator(control: AbstractControl<string>): ValidationErrors | null {
  return /^[A-Z0-9]{8}-[A-Z0-9]{4}$/i.test(control.value.replace(/\s+/g, ''))
    ? null
    : { backupCode: true };
}

/** The code as the server wants it: digits only. */
export function cleanTotpCode(raw: string): string {
  return raw.replace(/\s+/g, '');
}
