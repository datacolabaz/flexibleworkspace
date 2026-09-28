import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/lib/auth/session';

const BACKEND_URL = process.env.BACKEND_API_URL ?? '';

/**
 * BFF proxy: PATCH /api/provider/bookings/:bookingId/accept
 * → PATCH /provider/bookings/:bookingId/accept
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ bookingId: string }> },
) {
  const { accessToken } = readSession(request.cookies);
  if (!accessToken) {
    return NextResponse.json({ error: { code: 'UNAUTHENTICATED' } }, { status: 401 });
  }

  const { bookingId } = await params;
  const body = await request.json().catch(() => ({}));
  const backendPath = `${BACKEND_URL.replace(/\/$/, '')}/provider/bookings/${bookingId}/accept`;

  try {
    const response = await fetch(backendPath, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body ?? {}),
      cache: 'no-store',
    });
    const payload = await response.json().catch(() => ({}));
    return NextResponse.json(payload, { status: response.status });
  } catch {
    return NextResponse.json({ error: { code: 'BFF_INTERNAL_ERROR' } }, { status: 502 });
  }
}
