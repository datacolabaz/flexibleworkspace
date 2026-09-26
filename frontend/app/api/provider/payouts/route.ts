import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/lib/auth/session';

const BACKEND_URL = process.env.BACKEND_API_URL ?? '';

/**
 * BFF proxy: GET /api/provider/payouts → GET /providers/me/payouts
 * Returns the provider's payout history list.
 */
export async function GET(request: NextRequest) {
  const { accessToken } = readSession(request.cookies);
  if (!accessToken) {
    return NextResponse.json({ error: { code: 'UNAUTHENTICATED' } }, { status: 401 });
  }

  try {
    const response = await fetch(
      `${BACKEND_URL.replace(/\/$/, '')}/providers/me/payouts`,
      {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
        cache: 'no-store',
      },
    );
    const body = await response.json().catch(() => ({}));
    return NextResponse.json(body, { status: response.status });
  } catch {
    return NextResponse.json({ error: { code: 'BFF_INTERNAL_ERROR' } }, { status: 502 });
  }
}
