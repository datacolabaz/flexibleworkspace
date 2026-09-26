import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/auth/route-helpers';
import { purchaseTicket } from '@/lib/api-client/events';
import type { PurchaseTicketBody } from '@/lib/api-client/events';

/** POST /api/ticket-types/[typeId]/purchase — auth required */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ typeId: string }> },
) {
  const { typeId } = await params;
  const { accessToken } = readSession(request.cookies);
  if (!accessToken) {
    return NextResponse.json(
      { error: { code: 'UNAUTHENTICATED', message: 'Bilet almaq üçün daxil olun.' } },
      { status: 401 },
    );
  }

  let body: PurchaseTicketBody = {};
  try {
    const raw = await request.text();
    if (raw) body = JSON.parse(raw) as PurchaseTicketBody;
  } catch {
    // empty body is fine
  }

  try {
    const result = await purchaseTicket(typeId, body, accessToken);
    return NextResponse.json(result, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
