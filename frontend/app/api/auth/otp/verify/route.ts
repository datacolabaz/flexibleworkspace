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
 * The core of the BFF pattern (FRONTEND_IMPLEMENTATION_PLAN.md §4, item
 * 1): calls the backend, which returns `{accessToken, refreshToken,
 * expiresIn}` in the response body, and re-sets that pair as httpOnly
 * cookies on THIS origin instead of handing them back to the browser in
 * the JSON response — a page script can trigger this request, but can
 * never read the tokens themselves afterward.
 */
export async function POST(request: NextRequest) {
  let body: { identifier?: string; code?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: 'INVALID_JSON', message: 'Request body must be JSON.' } },
      { status: 400 },
    );
  }
  if (!body.identifier || !body.code) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'identifier and code are required.' } },
      { status: 400 },
    );
  }

  try {
    const client = createApiClient();
    const result = await client.POST('/auth/otp/verify', {
      body: { identifier: body.identifier, code: body.code },
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
