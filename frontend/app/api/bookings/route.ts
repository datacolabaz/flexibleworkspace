import { NextRequest, NextResponse } from 'next/server';
import { createBooking, type CreateBookingBody } from '@/lib/api-client/bookings';
import { readSession } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/auth/route-helpers';

/**
 * Thin proxy to `POST /bookings` (12_RESERVATION_ENGINE.md §12.3) — exists
 * so the client-rendered booking form (`BookingForm`) can call same-origin
 * `fetch` instead of importing the `server-only` `lib/api-client/bookings.ts`
 * directly, matching `/api/search`'s and `/api/favorites/{roomId}`'s BFF
 * pattern.
 *
 * Unlike `/api/favorites/{roomId}`, a missing session is NOT rejected here
 * — `POST /bookings` is itself public (guest checkout is the primary case
 * it exists to support, 05_USER_FLOWS.md §5.2), so the access token is
 * forwarded only when one exists and the request proceeds either way. The
 * backend alone decides whether the guest-contact fields are sufficient
 * (400 `CUSTOMER_IDENTIFIER_REQUIRED` for a signed-out caller with no
 * email/phone) — this route just relays whatever body the form sent.
 */
export async function POST(request: NextRequest) {
  const { accessToken } = readSession(request.cookies);

  let body: CreateBookingBody;
  try {
    body = (await request.json()) as CreateBookingBody;
  } catch {
    return NextResponse.json(
      { error: { code: 'INVALID_JSON', message: 'Request body must be JSON.' } },
      { status: 400 },
    );
  }

  try {
    const booking = await createBooking(body, accessToken);
    return NextResponse.json(booking, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
