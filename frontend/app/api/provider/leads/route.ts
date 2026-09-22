import { NextRequest, NextResponse } from 'next/server';
import { listMyLeads, LeadsApiError } from '@/lib/api-client/leads';
import { readSession } from '@/lib/auth/session';

function errorResponse(error: unknown) {
  if (error instanceof LeadsApiError) {
    return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.status });
  }
  console.error('Provider leads BFF route error:', error);
  return NextResponse.json(
    { error: { code: 'BFF_INTERNAL_ERROR', message: 'Leads request failed. Please try again.' } },
    { status: 502 },
  );
}

/** `GET /api/provider/leads` — the calling provider's own leads, used by `ProviderLeadsPanel` to refresh after a status change. */
export async function GET(request: NextRequest) {
  const accessToken = readSession(request.cookies).accessToken ?? null;
  if (!accessToken) {
    return NextResponse.json({ error: { code: 'UNAUTHENTICATED', message: 'Sign in required.' } }, { status: 401 });
  }
  try {
    return NextResponse.json(await listMyLeads(accessToken));
  } catch (error) {
    return errorResponse(error);
  }
}
