import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/auth/route-helpers';
import { linkVenue } from '@/lib/api-client/events';

/** POST /api/events/[id]/venue — link a venue/booking (organizer only) */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { accessToken } = readSession(request.cookies);
  if (!accessToken) {
    return NextResponse.json(
      { error: { code: 'UNAUTHENTICATED', message: 'Authentication required.' } },
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
    const el = await linkVenue(id, body as Parameters<typeof linkVenue>[1], accessToken);
    return NextResponse.json(el, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
