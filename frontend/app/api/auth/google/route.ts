import { NextRequest, NextResponse } from 'next/server';
import { createApiClient, unwrap } from '@/lib/api-client/client';
import { apiErrorResponse } from '@/lib/auth/route-helpers';
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  accessTokenCookieOptions,
  refreshTokenCookieOptions,
} from '@/lib/auth/cookies';

/**
 * Same BFF shape as app/api/auth/otp/verify/route.ts: the backend
 * verifies the Google ID token and returns {accessToken, refreshToken,
 * expiresIn}, which this route re-sets as httpOnly cookies on this
 * origin rather than handing back to the page script that called it.
 */
export async function POST(request: NextRequest) {
  let body: { idToken?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: 'INVALID_JSON', message: 'Request body must be JSON.' } },
      { status: 400 },
    );
  }
  if (!body.idToken) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'idToken is required.' } },
      { status: 400 },
    );
  }

  try {
    const client = createApiClient();
    const result = await client.POST('/auth/google', {
      body: { idToken: body.idToken },
    });
    const tokens = await unwrap(result);

    const response = NextResponse.json({ success: true });
    response.cookies.set(ACCESS_TOKEN_COOKIE, tokens.accessToken, accessTokenCookieOptions(tokens.expiresIn));
    response.cookies.set(REFRESH_TOKEN_COOKIE, tokens.refreshToken, refreshTokenCookieOptions());
    return response;
  } catch (err) {
    return apiErrorResponse(err);
  }
}
