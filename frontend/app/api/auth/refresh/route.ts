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
async function refreshResponse(request: NextRequest): Promise<NextResponse> {
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

export async function POST(request: NextRequest) {
  return refreshResponse(request);
}

/**
 * Server-rendered pages cannot mutate the browser cookie jar while rendering.
 * This redirect form gives them one safe, single refresh attempt whose
 * rotated cookies are then carried back to the page response.
 */
export async function GET(request: NextRequest) {
  const returnTo = request.nextUrl.searchParams.get('returnTo');
  const safeReturnTo = returnTo?.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/provider';
  const response = await refreshResponse(request);
  if (response.ok) {
    const redirectResponse = NextResponse.redirect(new URL(safeReturnTo, request.url));
    response.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie));
    return redirectResponse;
  }

  const expiredUrl = new URL('/provider?session=expired', request.url);
  const redirectResponse = NextResponse.redirect(expiredUrl);
  response.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie));
  return redirectResponse;
}
