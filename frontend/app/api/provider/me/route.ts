import { NextRequest, NextResponse } from 'next/server';
import { getMyProvider, ProviderApiError } from '@/lib/api-client/provider-dashboard';
import { readSession } from '@/lib/auth/session';

function errorResponse(error: unknown) {
  if (error instanceof ProviderApiError) {
    return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.status });
  }
  console.error('Provider BFF route error:', error);
  return NextResponse.json(
    { error: { code: 'BFF_INTERNAL_ERROR', message: 'Provider request failed. Please try again.' } },
    { status: 502 },
  );
}

function tokenOrNull(request: NextRequest) {
  return readSession(request.cookies).accessToken ?? null;
}

/** `/provider`'s own profile fetch — used by the page itself server-side too, but also exposed here so the client-side form can refresh after a save. */
export async function GET(request: NextRequest) {
  const accessToken = tokenOrNull(request);
  if (!accessToken) {
    return NextResponse.json({ error: { code: 'UNAUTHENTICATED', message: 'Sign in required.' } }, { status: 401 });
  }
  try {
    return NextResponse.json(await getMyProvider(accessToken));
  } catch (error) {
    return errorResponse(error);
  }
}
