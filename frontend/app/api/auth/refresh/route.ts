import { NextRequest, NextResponse } from 'next/server';
import { createApiClient, unwrap } from '@/lib/api-client/client';
import { apiErrorResponse } from '@/lib/auth/route-helpers';
import { readSession } from '@/lib/auth/session';
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  accessTokenCookieOptions,
  clearedCookieOptions,
  refreshTokenCookieOptions,
} from '@/lib/auth/cookies';

/**
 * Rotates the token pair (18_SECURITY.md — refresh tokens rotate on
 * use, so the backend's own `AuthService.refreshTokens` already
 * invalidates the old refresh token server-side; this route just carries
 * that rotation into the cookie jar). No request body needed — the
 * refresh token comes from this origin's own httpOnly cookie, not
 * something the caller supplies.
 */
export async function POST(request: NextRequest) {
  const { refreshToken } = readSession(request.cookies);
  if (!refreshToken) {
    return NextResponse.json(
      { error: { code: 'NO_SESSION', message: 'No refresh token cookie present.' } },
      { status: 401 },
    );
  }

  try {
    const client = createApiClient();
    const result = await client.POST('/auth/refresh', { body: { refreshToken } });
    const tokens = await unwrap(result);

    const response = NextResponse.json({ success: true });
    response.cookies.set(ACCESS_TOKEN_COOKIE, tokens.accessToken, accessTokenCookieOptions(tokens.expiresIn));
    response.cookies.set(REFRESH_TOKEN_COOKIE, tokens.refreshToken, refreshTokenCookieOptions());
    return response;
  } catch (err) {
    // An expired/invalid refresh token means the session is over —
    // clear both cookies so the frontend doesn't keep retrying against a
    // dead session, rather than leaving a stale refresh cookie behind.
    const response = apiErrorResponse(err);
    response.cookies.set(ACCESS_TOKEN_COOKIE, '', clearedCookieOptions());
    response.cookies.set(REFRESH_TOKEN_COOKIE, '', clearedCookieOptions());
    return response;
  }
}
