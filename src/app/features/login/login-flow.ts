import { Injectable, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable, firstValueFrom } from 'rxjs';
import {
  AdminSession,
  AdminSessionApi,
  MfaChallenge,
  MfaSetupChallenge,
  MfaSetupSecret,
} from '../../core/auth/admin-session.api';
import { safeReturnUrl } from '../../core/auth/return-url';
import { SessionStore } from '../../core/auth/session.store';
import { LoginAttempt, LoginMessage, describeLoginFailure } from './login-message';

export type LoginState =
  | { readonly step: 'password' }
  | { readonly step: 'mfa'; readonly challenge: MfaChallenge; readonly useBackupCode: boolean }
  | {
      readonly step: 'setup';
      readonly setup: MfaSetupChallenge;
      /** Null while it loads, or when loading failed (then `message` says why). */
      readonly secret: MfaSetupSecret | null;
    }
  | {
      readonly step: 'backup-codes';
      readonly codes: readonly string[];
      /** Opened by the server already (the cookie is set); taken once the codes are saved. */
      readonly session: AdminSession;
    };

/**
 * The sign-in of one visit to `/login`: password → MFA code (or a backup code) → session; an
 * administrator without MFA sets it up on the way (secret + QR → first code → backup codes
 * shown once). Provided by the login page, so every visit starts from the password step.
 */
@Injectable()
export class LoginFlow {
  private readonly api = inject(AdminSessionApi);
  private readonly session = inject(SessionStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly state = signal<LoginState>({ step: 'password' });
  /** The current error or notice; cleared by the next attempt. */
  readonly message = signal<LoginMessage | null>(null);
  readonly busy = signal(false);
  /** Kept for the next visit to the password step and for the backup-codes file. */
  readonly email = signal('');

  async submitPassword(email: string, password: string): Promise<void> {
    this.email.set(email);
    const step = await this.call('password', this.api.login(email, password));
    if (!step) return;
    if (step.kind === 'mfa') {
      this.state.set({ step: 'mfa', challenge: step, useBackupCode: false });
    } else {
      this.state.set({ step: 'setup', setup: step, secret: null });
      await this.loadSetupSecret();
    }
  }

  /** Switches the MFA step between the authenticator code and a backup code. */
  useBackupCode(useBackupCode: boolean): void {
    const state = this.state();
    if (state.step !== 'mfa') return;
    this.message.set(null);
    this.state.set({ ...state, useBackupCode });
  }

  async submitCode(code: string): Promise<void> {
    const state = this.state();
    if (state.step !== 'mfa' || this.expired(state.challenge.expiresAt)) return;
    const token = state.challenge.mfaChallengeToken;
    const session = state.useBackupCode
      ? await this.call('backup-code', this.api.verifyBackupCode(token, normaliseBackupCode(code)))
      : await this.call('code', this.api.verifyMfa(token, code.trim()));
    if (session) await this.finish(session);
  }

  /** Setup step 1: the secret and QR code. Called on entering the step and by "try again". */
  async loadSetupSecret(): Promise<void> {
    const state = this.state();
    if (state.step !== 'setup' || this.expired(state.setup.expiresAt)) return;
    const secret = await this.call('setup', this.api.startMfaSetup(state.setup.mfaSetupToken));
    const current = this.state();
    if (secret && current.step === 'setup') this.state.set({ ...current, secret });
  }

  /** Setup step 2: the first code turns MFA on; the backup codes come next, once. */
  async confirmSetup(code: string): Promise<void> {
    const state = this.state();
    if (state.step !== 'setup' || !state.secret || this.expired(state.setup.expiresAt)) return;
    const confirmed = await this.call(
      'setup',
      this.api.confirmMfaSetup(state.setup.mfaSetupToken, code.trim()),
    );
    if (!confirmed) return;
    const { backupCodes, ...session } = confirmed;
    this.state.set({ step: 'backup-codes', codes: backupCodes, session });
  }

  /** The administrator saved the backup codes: into the panel. */
  async finishBackupCodes(): Promise<void> {
    const state = this.state();
    if (state.step === 'backup-codes') await this.finish(state.session);
  }

  /** Back to the password step (a "back" link, or a token the server no longer takes). */
  restart(message: LoginMessage | null = null): void {
    this.state.set({ step: 'password' });
    this.message.set(message);
  }

  private async finish(session: AdminSession): Promise<void> {
    try {
      this.session.start(session);
    } catch (error) {
      // The server set the cookie of a session this panel cannot use: end it there too.
      void this.session.logout();
      this.fail(error, 'code');
      return;
    }
    const returnUrl = safeReturnUrl(this.route.snapshot.queryParamMap.get('returnUrl'));
    await this.router.navigateByUrl(returnUrl, { replaceUrl: true });
  }

  /** Runs one call: busy on, message off; a failure becomes the message (and maybe a restart). */
  private async call<T>(attempt: LoginAttempt, request: Observable<T>): Promise<T | null> {
    this.busy.set(true);
    this.message.set(null);
    try {
      return await firstValueFrom(request);
    } catch (error) {
      this.fail(error, attempt);
      return null;
    } finally {
      this.busy.set(false);
    }
  }

  private fail(error: unknown, attempt: LoginAttempt): void {
    const failure = describeLoginFailure(error, attempt);
    if (failure.restart) this.restart(failure.message);
    else this.message.set(failure.message);
  }

  /** A challenge or setup token past its time is not worth a round trip: start over. */
  private expired(expiresAt: string): boolean {
    const at = Date.parse(expiresAt);
    if (Number.isNaN(at) || at > Date.now()) return false;
    this.restart({ key: 'expired' });
    return true;
  }
}

/** Backup codes are `XXXXXXXX-XXXX`, upper case; people type them in any case, with spaces. */
export function normaliseBackupCode(raw: string): string {
  return raw.replace(/\s+/g, '').toUpperCase();
}
