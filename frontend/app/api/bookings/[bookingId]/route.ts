import { NextRequest, NextResponse } from 'next/server';
import { getBooking } from '@/lib/api-client/bookings';
import { readSession } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/auth/route-helpers';

/**
 * Thin proxy to `GET /bookings/{bookingId}` — the real endpoint is
 * `@Public()` with optional auth (possession of the opaque booking id is
 * the gate for a guest; see `bookings.controller.ts`'s doc comment), so
 * this route forwards a session token when one exists but never requires
 * one, matching `/api/bookings`'s POST route. Primary caller: the payment-
 * confirmation page (`/booking/{bookingId}/confirming`) polling booking
 * status after a redirect back from hosted checkout — the redirect itself
 * isn't authoritative, only the provider webhook is
 * (13_PAYMENT_ARCHITECTURE.md §13.3 steps 4-5), so that page must poll
 * this route rather than trust its own query params.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ bookingId: string }> }) {
  const { bookingId } = await params;
  const { accessToken } = readSession(request.cookies);

  try {
    const booking = await getBooking(bookingId, accessToken);
    return NextResponse.json(booking, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
