import { NextRequest, NextResponse } from 'next/server';
import { createCheckoutSession, type CreateCheckoutBody } from '@/lib/api-client/payments';
import { readSession } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/auth/route-helpers';

/**
 * Thin proxy to `POST /payments` (13_PAYMENT_ARCHITECTURE.md §13.3) —
 * same optional-auth shape as `/api/bookings`: a guest who just created a
 * booking has no session, and `PaymentsService.createCheckoutSession`
 * only checks ownership when a caller id is present, so the token is
 * forwarded when available and omitted otherwise rather than required.
 */
export async function POST(request: NextRequest) {
  const { accessToken } = readSession(request.cookies);

  let body: CreateCheckoutBody;
  try {
    body = (await request.json()) as CreateCheckoutBody;
  } catch {
    return NextResponse.json(
      { error: { code: 'INVALID_JSON', message: 'Request body must be JSON.' } },
      { status: 400 },
    );
  }

  try {
    const session = await createCheckoutSession(body, accessToken);
    return NextResponse.json(session, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
