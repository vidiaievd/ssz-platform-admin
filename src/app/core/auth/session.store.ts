import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AdminLevel, adminLevelAtLeast } from './admin-level';
import { AdminSession, AdminSessionApi } from './admin-session.api';
import { ApiError } from './api-error';
import { AccessClaims, decodeAccessClaims } from './jwt-claims';

interface SessionState {
  readonly accessToken: string;
  readonly claims: AccessClaims;
  readonly sessionExpiresAt: Date;
}

/** Name of the Web Lock that serialises refreshes across the panel's tabs. */
const REFRESH_LOCK = 'ssz-admin.session-refresh';

const MALFORMED_ACCESS_TOKEN = 'MALFORMED_ACCESS_TOKEN';

/**
 * The admin session of this tab. The access token lives in memory only (a signal); what
 * survives a reload is the httpOnly refresh cookie, which `restore()` trades for a new token.
 *
 * Refresh is single-flight: parallel callers share one request, and tabs take turns through a
 * Web Lock — the cookie rotates on every refresh, so two requests with the same cookie would
 * leave the second one with a 401 and sign that tab out.
 */
@Injectable({ providedIn: 'root' })
export class SessionStore {
  private readonly api = inject(AdminSessionApi);
  private readonly state = signal<SessionState | null>(null);
  private refreshing: Promise<string | null> | null = null;

  readonly accessToken = computed(() => this.state()?.accessToken ?? null);
  readonly claims = computed(() => this.state()?.claims ?? null);
  readonly adminLevel = computed(() => this.state()?.claims.adminLevel ?? null);
  readonly sessionExpiresAt = computed(() => this.state()?.sessionExpiresAt ?? null);
  readonly isAuthenticated = computed(() => this.state() !== null);

  hasLevel(required: AdminLevel): boolean {
    return adminLevelAtLeast(this.adminLevel(), required);
  }

  /** Takes a session from a sign-in step (or a refresh). A token the panel cannot read is refused. */
  start(session: AdminSession): void {
    const claims = decodeAccessClaims(session.accessToken);
    if (!claims?.adminLevel) {
      this.state.set(null);
      throw new ApiError(200, MALFORMED_ACCESS_TOKEN, 'The access token has no admin level');
    }
    this.state.set({
      accessToken: session.accessToken,
      claims,
      sessionExpiresAt: new Date(session.sessionExpiresAt),
    });
  }

  clear(): void {
    this.state.set(null);
  }

  /**
   * A new access token from the cookie. Resolves with the token, or with null when the
   * session is over (401/403 — the store is cleared). Rejects with `ApiError` when the gateway
   * could not answer (network, 5xx): the session may still be alive, so it is kept.
   */
  refresh(): Promise<string | null> {
    this.refreshing ??= this.withRefreshLock(() => this.doRefresh()).finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  /** At start-up: a reload of the tab keeps the administrator signed in. Never rejects. */
  async restore(): Promise<void> {
    try {
      await this.refresh();
    } catch {
      // Gateway unreachable: start signed out; the login screen will say what is wrong.
    }
  }

  /** Ends the session on the server (best effort) and here. */
  async logout(): Promise<void> {
    try {
      await firstValueFrom(this.api.logout());
    } catch {
      // The cookie may outlive a failed call, but this tab forgets the token either way.
    } finally {
      this.clear();
    }
  }

  private async doRefresh(): Promise<string | null> {
    try {
      const session = await firstValueFrom(this.api.refresh());
      this.start(session);
      return session.accessToken;
    } catch (error) {
      const apiError = ApiError.from(error);
      // 401: no or stale cookie; 403: no longer an administrator with a level and MFA (the
      // server ended the session); a token without a level cannot drive the panel either.
      const ended =
        apiError.status === 401 ||
        apiError.status === 403 ||
        apiError.code === MALFORMED_ACCESS_TOKEN;
      if (ended) {
        this.clear();
        return null;
      }
      throw apiError;
    }
  }

  private withRefreshLock<T>(task: () => Promise<T>): Promise<T> {
    const locks = globalThis.navigator?.locks;
    return locks ? locks.request(REFRESH_LOCK, task) : task();
  }
}
