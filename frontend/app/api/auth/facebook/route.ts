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
 * Same BFF shape as app/api/auth/google/route.ts — see that file. The
 * backend verifies the Facebook access token (debug_token + /me against
 * the Graph API) and returns a token pair this route turns into httpOnly
 * cookies.
 */
export async function POST(request: NextRequest) {
  let body: { accessToken?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: 'INVALID_JSON', message: 'Request body must be JSON.' } },
      { status: 400 },
    );
  }
  if (!body.accessToken) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'accessToken is required.' } },
      { status: 400 },
    );
  }

  try {
    const client = createApiClient();
    const result = await client.POST('/auth/facebook', {
      body: { accessToken: body.accessToken },
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
