import { NextRequest, NextResponse } from 'next/server';
import { getRoomMedia, ProviderRoomsApiError } from '@/lib/api-client/provider-rooms';
import { readSession } from '@/lib/auth/session';

function errorResponse(error: unknown) {
  if (error instanceof ProviderRoomsApiError) {
    return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.status });
  }
  console.error('Provider room media BFF route error:', error);
  return NextResponse.json(
    { error: { code: 'BFF_INTERNAL_ERROR', message: 'Request failed. Please try again.' } },
    { status: 502 },
  );
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { accessToken } = readSession(request.cookies);
  if (!accessToken) {
    return NextResponse.json({ error: { code: 'UNAUTHENTICATED', message: 'Sign in required.' } }, { status: 401 });
  }
  try {
    return NextResponse.json(await getRoomMedia(accessToken, id));
  } catch (error) {
    return errorResponse(error);
  }
}
