import { NextRequest, NextResponse } from 'next/server';
import { updateMyLocation, ProviderRoomsApiError, type CreateLocationInput } from '@/lib/api-client/provider-rooms';
import { readSession } from '@/lib/auth/session';

function errorResponse(error: unknown) {
  if (error instanceof ProviderRoomsApiError) {
    return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.status });
  }
  console.error('Provider location BFF route error:', error);
  return NextResponse.json(
    { error: { code: 'BFF_INTERNAL_ERROR', message: 'Request failed. Please try again.' } },
    { status: 502 },
  );
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { accessToken } = readSession(request.cookies);
  if (!accessToken) {
    return NextResponse.json({ error: { code: 'UNAUTHENTICATED', message: 'Sign in required.' } }, { status: 401 });
  }
  try {
    const body = (await request.json()) as CreateLocationInput;
    return NextResponse.json(await updateMyLocation(accessToken, id, body));
  } catch (error) {
    return errorResponse(error);
  }
}
