/**
 * Guards a post-login `?redirect=` target against becoming an open
 * redirect: only a same-origin, path-absolute string
 * (`/account/bookings`, not `https://evil.example`, not `//evil.example`
 * — a protocol-relative URL that still changes host) is accepted. A
 * `\\` prefix is rejected too — some browsers historically treat
 * `\evil.example` as protocol-relative, same as `//`.
 */
export function safeRedirectTarget(raw: string | undefined | null): string | undefined {
  if (!raw) return undefined;
  if (!raw.startsWith('/')) return undefined;
  if (raw.startsWith('//') || raw.startsWith('/\\')) return undefined;
  return raw;
}
