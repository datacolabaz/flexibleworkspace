import { NextRequest, NextResponse } from 'next/server';
import { uploadMyVerificationDocument, ProviderApiError } from '@/lib/api-client/provider-dashboard';
import { readSession } from '@/lib/auth/session';

function errorResponse(error: unknown) {
  if (error instanceof ProviderApiError) {
    return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.status });
  }
  console.error('Provider BFF route error:', error);
  return NextResponse.json(
    { error: { code: 'BFF_INTERNAL_ERROR', message: 'Document upload failed. Please try again.' } },
    { status: 502 },
  );
}

/**
 * Multipart passthrough — `ProviderVerificationUploadForm` (Client
 * Component) posts a `FormData` here (fields: `file`, `documentType`),
 * this route reads it back out as a `FormData` and forwards it unchanged
 * to the backend, attaching the bearer token from the session cookie the
 * browser can't read directly.
 */
export async function POST(request: NextRequest) {
  const { accessToken } = readSession(request.cookies);
  if (!accessToken) {
    return NextResponse.json({ error: { code: 'UNAUTHENTICATED', message: 'Sign in required.' } }, { status: 401 });
  }
  try {
    const formData = await request.formData();
    return NextResponse.json(await uploadMyVerificationDocument(accessToken, formData));
  } catch (error) {
    return errorResponse(error);
  }
}
