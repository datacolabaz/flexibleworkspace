import { NextRequest, NextResponse } from 'next/server';
import { getRoomAvailability } from '@/lib/api-client/rooms';
import { apiErrorResponse } from '@/lib/auth/route-helpers';

/**
 * Thin public proxy to `GET /spaces/{roomId}/availability` — same reason
 * as `/api/search`: `lib/api-client/rooms.ts` is `server-only`, so the
 * booking widget (a Client Component — it needs date/time selection
 * state) can't import it directly and has to go through same-origin
 * `fetch` instead. No session cookie is read here; availability is
 * public, matching the real `@Public()` backend endpoint.
 *
 * Live availability changes as other customers book, so this is never
 * cached.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const date = new URL(request.url).searchParams.get('date');
  if (!date) {
    return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: '`date` query param is required.' } }, { status: 400 });
  }

  try {
    const result = await getRoomAvailability(id, date);
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
