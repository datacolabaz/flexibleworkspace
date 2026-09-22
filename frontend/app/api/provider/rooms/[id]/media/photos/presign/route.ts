import { NextRequest, NextResponse } from 'next/server';
import { presignRoomPhoto, ProviderRoomsApiError, type PresignInput } from '@/lib/api-client/provider-rooms';
import { readSession } from '@/lib/auth/session';

function errorResponse(error: unknown) {
  if (error instanceof ProviderRoomsApiError) {
    return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.status });
  }
  console.error('Provider room photo presign BFF route error:', error);
  return NextResponse.json(
    { error: { code: 'BFF_INTERNAL_ERROR', message: 'Request failed. Please try again.' } },
    { status: 502 },
  );
}

/** Step 1 of the direct-upload dance — see `provider-rooms.ts`'s "Media" section comment for the full 3-step flow. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { accessToken } = readSession(request.cookies);
  if (!accessToken) {
    return NextResponse.json({ error: { code: 'UNAUTHENTICATED', message: 'Sign in required.' } }, { status: 401 });
  }
  try {
    const body = (await request.json()) as PresignInput;
    return NextResponse.json(await presignRoomPhoto(accessToken, id, body));
  } catch (error) {
    return errorResponse(error);
  }
}
