import { NextRequest, NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/auth/route-helpers';
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  accessTokenCookieOptions,
  refreshTokenCookieOptions,
} from '@/lib/auth/cookies';

const BACKEND = () => {
  const base = process.env.BACKEND_API_URL;
  if (!base) throw new Error('BACKEND_API_URL not set');
  return base.replace(/\/$/, '');
};

/**
 * Task 3 — POST /api/auth/admin/totp/login
 * Second-factor admin login: validates TOTP token and issues a JWT pair.
 * Public route — no existing session required.
 * Body: { userId: string; token: string }.
 * On success, sets httpOnly auth cookies (same as admin-password route).
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: 'INVALID_JSON', message: 'Request body must be JSON.' } },
      { status: 400 },
    );
  }

  try {
    const res = await fetch(`${BACKEND()}/auth/admin/totp/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });

    const resBody = await res.json();
    if (!res.ok) {
      return NextResponse.json(resBody, { status: res.status });
    }

    const tokens = resBody as { accessToken: string; refreshToken: string; expiresIn: number };
    const response = NextResponse.json({ success: true });
    response.cookies.set(ACCESS_TOKEN_COOKIE, tokens.accessToken, accessTokenCookieOptions(tokens.expiresIn));
    response.cookies.set(REFRESH_TOKEN_COOKIE, tokens.refreshToken, refreshTokenCookieOptions());
    return response;
  } catch (err) {
    return apiErrorResponse(err);
  }
}
