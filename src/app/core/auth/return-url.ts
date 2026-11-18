/**
 * A `returnUrl` the panel may navigate to after sign-in: a path inside the panel only.
 * Anything else (`//evil.example`, `https://…`, `/\evil`, `/login` itself) becomes `/`, so a
 * crafted link cannot send a freshly signed-in administrator off the panel.
 */
export function safeReturnUrl(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return '/';
  if ([...raw].some((c) => c.charCodeAt(0) < 0x20)) return '/';
  if (raw === '/login' || raw.startsWith('/login?') || raw.startsWith('/login/')) return '/';
  return raw;
}
