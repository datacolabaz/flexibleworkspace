import { NextRequest, NextResponse } from 'next/server';
import { updateLeadStatus, LeadsApiError, type LeadStatus } from '@/lib/api-client/leads';
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

/** `PATCH /api/provider/leads/:id/status` — mark a lead as contacted/converted/closed. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const accessToken = readSession(request.cookies).accessToken ?? null;
  if (!accessToken) {
    return NextResponse.json({ error: { code: 'UNAUTHENTICATED', message: 'Sign in required.' } }, { status: 401 });
  }
  try {
    const body = (await request.json()) as { status: LeadStatus };
    return NextResponse.json(await updateLeadStatus(accessToken, id, body.status));
  } catch (error) {
    return errorResponse(error);
  }
}
