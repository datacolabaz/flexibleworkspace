import { NextRequest, NextResponse } from 'next/server';
import { uploadMyRoomPhoto, ProviderRoomsApiError } from '@/lib/api-client/provider-rooms';
import { readSession } from '@/lib/auth/session';

function errorResponse(error: unknown) {
  if (error instanceof ProviderRoomsApiError) {
    return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.status });
  }
  console.error('Provider room photo BFF route error:', error);
  return NextResponse.json(
    { error: { code: 'BFF_INTERNAL_ERROR', message: 'Photo upload failed. Please try again.' } },
    { status: 502 },
  );
}

/** Multipart passthrough — same pattern as `provider/me/verification-documents`. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { accessToken } = readSession(request.cookies);
  if (!accessToken) {
    return NextResponse.json({ error: { code: 'UNAUTHENTICATED', message: 'Sign in required.' } }, { status: 401 });
  }
  try {
    const formData = await request.formData();
    return NextResponse.json(await uploadMyRoomPhoto(accessToken, id, formData));
  } catch (error) {
    return errorResponse(error);
  }
}
