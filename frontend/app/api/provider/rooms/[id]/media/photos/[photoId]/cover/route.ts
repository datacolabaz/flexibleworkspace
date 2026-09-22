import { NextRequest, NextResponse } from 'next/server';
import { setCoverRoomPhoto, ProviderRoomsApiError } from '@/lib/api-client/provider-rooms';
import { readSession } from '@/lib/auth/session';

function errorResponse(error: unknown) {
  if (error instanceof ProviderRoomsApiError) {
    return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.status });
  }
  console.error('Provider room set-cover BFF route error:', error);
  return NextResponse.json(
    { error: { code: 'BFF_INTERNAL_ERROR', message: 'Request failed. Please try again.' } },
    { status: 502 },
  );
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; photoId: string }> },
) {
  const { id, photoId } = await params;
  const { accessToken } = readSession(request.cookies);
  if (!accessToken) {
    return NextResponse.json({ error: { code: 'UNAUTHENTICATED', message: 'Sign in required.' } }, { status: 401 });
  }
  try {
    return NextResponse.json(await setCoverRoomPhoto(accessToken, id, photoId));
  } catch (error) {
    return errorResponse(error);
  }
}
