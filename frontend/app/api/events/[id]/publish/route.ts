import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/auth/route-helpers';
import { publishEvent } from '@/lib/api-client/events';

/** POST /api/events/[id]/publish */
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

  try {
    const event = await publishEvent(id, accessToken);
    return NextResponse.json(event, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
