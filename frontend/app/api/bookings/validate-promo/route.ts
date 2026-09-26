import { NextRequest, NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/auth/route-helpers';

const BACKEND = () => {
  const base = process.env.BACKEND_API_URL;
  if (!base) throw new Error('BACKEND_API_URL not set');
  return base.replace(/\/$/, '');
};

/**
 * Task 4 — POST /api/bookings/validate-promo
 * Proxies to backend POST /bookings/promo/validate.
 * Public endpoint — no auth required (promo codes are public).
 * Body: { code: string; bookingAmount: number }
 * Returns: { promoCodeId: string; discountAmount: number }
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
    const res = await fetch(`${BACKEND()}/bookings/promo/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });
    const resBody = await res.json();
    return NextResponse.json(resBody, { status: res.status });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
