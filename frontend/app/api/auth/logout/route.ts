import { NextRequest, NextResponse } from 'next/server';
import { createApiClient, unwrap } from '@/lib/api-client/client';
import { readSession } from '@/lib/auth/session';
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE, clearedCookieOptions } from '@/lib/auth/cookies';

/**
 * Clears this origin's session cookies unconditionally, and best-effort
 * revokes the refresh token server-side first (AuthController's
 * POST /auth/logout, 18_SECURITY.md). "Best-effort" is deliberate: if the
 * backend call fails (network blip, backend down), the user should still
 * be logged out of the frontend — being unable to sign out locally
 * because of a transient backend error would be worse than a refresh
 * token that stays valid server-side a little longer than intended.
 */
export async function POST(request: NextRequest) {
  const { refreshToken } = readSession(request.cookies);

  if (refreshToken) {
    try {
      const client = createApiClient();
      const result = await client.POST('/auth/logout', { body: { refreshToken } });
      await unwrap(result);
    } catch (err) {
      console.error('Best-effort backend logout failed (cookies are cleared regardless):', err);
    }
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set(ACCESS_TOKEN_COOKIE, '', clearedCookieOptions());
  response.cookies.set(REFRESH_TOKEN_COOKIE, '', clearedCookieOptions());
  return response;
}
