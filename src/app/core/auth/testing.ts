/** Test helpers for `core/auth`; used by specs only. */

/** An unsigned JWT with the given payload (the panel never checks signatures). */
export function fakeJwt(payload: Record<string, unknown>): string {
  const encode = (value: unknown) => {
    const bytes = new TextEncoder().encode(JSON.stringify(value));
    const binary = Array.from(bytes, (b) => String.fromCharCode(b)).join('');
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };
  return `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode(payload)}.signature`;
}

/** An admin access token as auth-service issues it for the admin client. */
export function adminToken(overrides: Record<string, unknown> = {}): string {
  return fakeJwt({
    sub: 'admin-1',
    email: 'admin@example.no',
    role: 'platform_admin',
    admin_level: 'super',
    exp: Math.floor(Date.now() / 1000) + 900,
    ...overrides,
  });
}

/** The body of a session response around `accessToken`. */
export function sessionBody(accessToken: string) {
  return {
    accessToken,
    accessTokenExpiresAt: '2030-01-01T00:15:00Z',
    sessionExpiresAt: '2030-01-01T12:00:00Z',
  };
}

/** Lets promise chains (firstValueFrom, from(promise)) settle between HTTP flushes. */
export function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve));
}
