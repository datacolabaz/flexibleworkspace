import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/auth/route-helpers';
import { checkIn } from '@/lib/api-client/events';

/** POST /api/tickets/[qrCode]/check-in — organizer auth */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ qrCode: string }> },
) {
  const { qrCode } = await params;
  const { accessToken } = readSession(request.cookies);
  if (!accessToken) {
    return NextResponse.json(
      { error: { code: 'UNAUTHENTICATED', message: 'Authentication required.' } },
      { status: 401 },
    );
  }

  try {
    const result = await checkIn(qrCode, accessToken);
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
