import { NextRequest, NextResponse } from 'next/server';
import { submitLead, type CreateLeadInput } from '@/lib/api-client/leads';
import { apiErrorResponse } from '@/lib/auth/route-helpers';

/**
 * `POST /api/rooms/:id/leads` — public passthrough to `POST
 * spaces/:roomId/leads` (Sprint 3, Lead Tracking). No session cookie
 * read, matching the backend's `@Public()` route — a signed-out visitor
 * on the room detail page can express interest without an account.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = (await request.json()) as CreateLeadInput;
    const lead = await submitLead(id, body);
    return NextResponse.json(lead, { status: 201 });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
