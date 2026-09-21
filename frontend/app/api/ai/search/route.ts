import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const backend = process.env.BACKEND_API_URL;
  if (!backend) return NextResponse.json({ error: { message: 'AI search is not configured.' } }, { status: 503 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body.query !== 'string') {
    return NextResponse.json({ error: { message: 'A search request is required.' } }, { status: 400 });
  }

  const response = await fetch(`${backend.replace(/\/$/, '')}/ai/search`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: body.query.slice(0, 500), locale: body.locale }),
    cache: 'no-store',
  });

  return NextResponse.json(
    await response.json().catch(() => ({ error: { message: 'AI search failed.' } })),
    { status: response.status },
  );
}
