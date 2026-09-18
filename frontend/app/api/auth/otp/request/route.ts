import { NextRequest, NextResponse } from 'next/server';
import { createApiClient, unwrap } from '@/lib/api-client/client';
import { apiErrorResponse } from '@/lib/auth/route-helpers';

/**
 * Thin proxy — no session cookies are touched here (identity isn't
 * established yet). Exists mainly so the browser only ever talks to this
 * frontend's own origin, never `BACKEND_API_URL` directly (that value is
 * server-only — see lib/api-client/client.ts).
 */
export async function POST(request: NextRequest) {
  let body: { identifier?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: 'INVALID_JSON', message: 'Request body must be JSON.' } },
      { status: 400 },
    );
  }
  if (!body.identifier) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'identifier is required.' } },
      { status: 400 },
    );
  }

  try {
    const client = createApiClient();
    const result = await client.POST('/auth/otp/request', {
      body: { identifier: body.identifier },
    });
    await unwrap(result);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
