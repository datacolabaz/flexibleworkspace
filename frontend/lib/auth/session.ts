import 'server-only';
import { cookies } from 'next/headers';
import { createApiClient } from '../api-client/client';
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from './cookies';

/** The minimal cookie-reading surface this module needs — both
 * `next/headers`'s `cookies()` (Server Components) and a `NextRequest`'s
 * `.cookies` (Route Handlers) satisfy this, so the functions below work
 * in either context without duplicating logic. */
export interface ReadableCookieStore {
  get(name: string): { value: string } | undefined;
}

export function readSession(store: ReadableCookieStore): { accessToken?: string; refreshToken?: string } {
  return {
    accessToken: store.get(ACCESS_TOKEN_COOKIE)?.value,
    refreshToken: store.get(REFRESH_TOKEN_COOKIE)?.value,
  };
}

/**
 * For Server Components/Server Actions rendering authenticated data
 * (`/account/*` per FRONTEND_IMPLEMENTATION_PLAN.md §4): reads the
 * session cookie via `next/headers` and returns a client with the
 * bearer token already attached, or `null` if there's no access-token
 * cookie. This does NOT refresh an expired token — a Server Component
 * that gets a 401 back from a call made with this client should treat
 * the user as signed out (redirect to login), rather than trying to
 * silently refresh mid-render; refreshing belongs to `/api/auth/refresh`,
 * called from the client before the next navigation.
 */
export async function getSessionApiClient() {
  const store = await cookies();
  const { accessToken } = readSession(store);
  if (!accessToken) return null;
  return createApiClient({ accessToken });
}
