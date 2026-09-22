import { NextRequest, NextResponse } from 'next/server';
import { getMyProviderAnalytics, ProviderAnalyticsApiError } from '@/lib/api-client/provider-analytics';
import { readSession } from '@/lib/auth/session';

function tokenOrNull(request: NextRequest) {
  return readSession(request.cookies).accessToken ?? null;
}

export async function GET(request: NextRequest) {
  const accessToken = tokenOrNull(request);
  if (!accessToken) {
    return NextResponse.json({ error: { code: 'UNAUTHENTICATED', message: 'Sign in required.' } }, { status: 401 });
  }
  try {
    return NextResponse.json(await getMyProviderAnalytics(accessToken));
  } catch (error) {
    if (error instanceof ProviderAnalyticsApiError) {
      return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.status });
    }
    console.error('Provider analytics BFF route error:', error);
    return NextResponse.json(
      { error: { code: 'BFF_INTERNAL_ERROR', message: 'Request failed. Please try again.' } },
      { status: 502 },
    );
  }
}
