import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/auth/route-helpers';
import { createRsvp } from '@/lib/api-client/events';

/** POST /api/events/[id]/rsvp — public endpoint (auth optional) */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { accessToken } = readSession(request.cookies);

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
    const rsvp = await createRsvp(id, body as Parameters<typeof createRsvp>[1], accessToken);
    return NextResponse.json(rsvp, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
