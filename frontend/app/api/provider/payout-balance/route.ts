import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/lib/auth/session';

const BACKEND_URL = process.env.BACKEND_API_URL ?? '';

/**
 * BFF proxy: GET /api/provider/payout-balance → GET /providers/me/payout-balance
 * Returns the provider's revenue/payout balance breakdown from the ledger.
 */
export async function GET(request: NextRequest) {
  const { accessToken } = readSession(request.cookies);
  if (!accessToken) {
    return NextResponse.json({ error: { code: 'UNAUTHENTICATED' } }, { status: 401 });
  }

  try {
    const response = await fetch(
      `${BACKEND_URL.replace(/\/$/, '')}/providers/me/payout-balance`,
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
