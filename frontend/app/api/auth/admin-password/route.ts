import { NextRequest, NextResponse } from 'next/server';
import { AdminApiError, loginWithAdminPassword } from '@/lib/api-client/admin';
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  accessTokenCookieOptions,
  refreshTokenCookieOptions,
} from '@/lib/auth/cookies';

export async function POST(request: NextRequest) {
  let body: { email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: 'INVALID_JSON', message: 'Request body must be JSON.' } },
      { status: 400 },
    );
  }

  if (!body.email || !body.password) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Email and password are required.' } },
      { status: 400 },
    );
  }

  try {
    const tokens = await loginWithAdminPassword(body.email, body.password);
    const response = NextResponse.json({ success: true });
    response.cookies.set(ACCESS_TOKEN_COOKIE, tokens.accessToken, accessTokenCookieOptions(tokens.expiresIn));
    response.cookies.set(REFRESH_TOKEN_COOKIE, tokens.refreshToken, refreshTokenCookieOptions());
    return response;
  } catch (error) {
    if (error instanceof AdminApiError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status },
      );
    }
    console.error('Admin password BFF route error:', error);
    return NextResponse.json(
      { error: { code: 'BFF_INTERNAL_ERROR', message: 'Admin login is temporarily unavailable.' } },
      { status: 502 },
    );
  }
}
