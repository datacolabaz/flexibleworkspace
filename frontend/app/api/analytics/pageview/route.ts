import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const backend = process.env.BACKEND_API_URL;
  if (!backend) return NextResponse.json({ accepted: false }, { status: 503 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body.path !== 'string' || body.path.length === 0) {
    return NextResponse.json({ accepted: false }, { status: 400 });
  }

  const response = await fetch(`${backend.replace(/\/$/, '')}/analytics/pageview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ path: body.path.slice(0, 500), ...(typeof body.roomId === 'string' ? { roomId: body.roomId } : {}) }),
    cache: 'no-store',
  });

  return NextResponse.json(await response.json().catch(() => ({ accepted: false })), { status: response.status });
}
