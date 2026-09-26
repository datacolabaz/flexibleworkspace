import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/auth/route-helpers';

const BACKEND = () => {
  const base = process.env.BACKEND_API_URL;
  if (!base) throw new Error('BACKEND_API_URL not set');
  return base.replace(/\/$/, '');
};

/**
 * Task 3 — POST /api/auth/admin/totp/verify
 * Proxies to backend POST /auth/admin/totp/verify.
 * Requires an active admin session. Body: { token: string }.
 * Returns 204 on success (no content).
 */
export async function POST(request: NextRequest) {
  const { accessToken } = readSession(request.cookies);
  if (!accessToken) {
    return NextResponse.json(
      { error: { code: 'UNAUTHENTICATED', message: 'Admin session required.' } },
      { status: 401 },
    );
  }

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
    const res = await fetch(`${BACKEND()}/auth/admin/totp/verify`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (res.status === 204) return new NextResponse(null, { status: 204 });
    const resBody = await res.json();
    return NextResponse.json(resBody, { status: res.status });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
