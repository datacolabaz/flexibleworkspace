import { NextRequest, NextResponse } from 'next/server';

/**
 * BFF analytics event ingestion endpoint.
 *
 * Accepts:  POST /api/analytics/event
 * Body:     { event: string; props?: Record<string, unknown>; ts?: number }
 *
 * Behaviour:
 *  - Tries to forward the event to the backend analytics endpoint
 *    (`POST /analytics/event`) when `BACKEND_API_URL` is set.
 *  - If the backend call fails (backend down, endpoint not yet implemented),
 *    the failure is silently swallowed and the client receives `{ accepted: true }`.
 *    Analytics must never surface errors to the customer.
 *  - No payment card data or raw PII is forwarded — the client-side
 *    `track()` helper already enforces this.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);

  if (!body || typeof body.event !== 'string' || !body.event) {
    return NextResponse.json(
      { accepted: false, error: 'Missing event name' },
      { status: 400 },
    );
  }

  const backend = process.env.BACKEND_API_URL;
  if (backend) {
    // Best-effort forward to backend — ignore failures so analytics
    // never affects the customer experience.
    void fetch(`${backend.replace(/\/$/, '')}/analytics/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: body.event,
        props: body.props ?? {},
        ts: body.ts ?? Date.now(),
        // Forward the real client IP for pseudonymous session correlation
        // (no PII — IP is hashed on the backend before storage).
        ip: request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? 'unknown',
        userAgent: request.headers.get('user-agent') ?? 'unknown',
      }),
      signal: AbortSignal.timeout(3000),
    }).catch(() => {
      // Backend not yet wired up for custom events — acceptable in V1.
    });
  }

  return NextResponse.json({ accepted: true });
}
