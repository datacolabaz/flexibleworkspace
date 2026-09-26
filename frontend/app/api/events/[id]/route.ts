import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/auth/route-helpers';
import { updateEvent, getPublicEvent } from '@/lib/api-client/events';

/** GET /api/events/[id] — public event detail by slug or id */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const event = await getPublicEvent(id);
    return NextResponse.json(event, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

/** PATCH /api/events/[id] — update an event (organizer only) */
export async function PATCH(
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
    const event = await updateEvent(id, body as Parameters<typeof updateEvent>[1], accessToken);
    return NextResponse.json(event, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
