import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/auth/route-helpers';
import { getMyEvents } from '@/lib/api-client/events';

/** GET /api/events/me — organizer's own events */
export async function GET(request: NextRequest) {
  const { accessToken } = readSession(request.cookies);
  if (!accessToken) {
    return NextResponse.json(
      { error: { code: 'UNAUTHENTICATED', message: 'Authentication required.' } },
      { status: 401 },
    );
  }

  try {
    const events = await getMyEvents(accessToken);
    return NextResponse.json(events, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
