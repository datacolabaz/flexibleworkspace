import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/auth/route-helpers';

const BACKEND = () => {
  const base = process.env.BACKEND_API_URL;
  if (!base) throw new Error('BACKEND_API_URL not set');
  return base.replace(/\/$/, '');
};

/**
 * Task 3 — POST /api/auth/admin/totp/setup
 * Proxies to backend POST /auth/admin/totp/setup.
 * Requires an active admin session (access token forwarded as Bearer).
 * Returns { otpauthUri: string; secret: string }.
 */
export async function POST(request: NextRequest) {
  const { accessToken } = readSession(request.cookies);
  if (!accessToken) {
    return NextResponse.json(
      { error: { code: 'UNAUTHENTICATED', message: 'Admin session required.' } },
      { status: 401 },
    );
  }

  try {
    const res = await fetch(`${BACKEND()}/auth/admin/totp/setup`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    });

    const body = await res.json();
    return NextResponse.json(body, { status: res.status });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
