import { NextRequest, NextResponse } from 'next/server';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as
    | { type?: string; eventId?: string }
    | null;
  if (!body || (body.type !== 'impression' && body.type !== 'click')) {
    return NextResponse.json({ recorded: false }, { status: 400 });
  }
  const backend = process.env.BACKEND_API_URL;
  if (!backend) return NextResponse.json({ recorded: false });
  try {
    const response = await fetch(`${backend.replace(/\/$/, '')}/ads/campaigns/${encodeURIComponent(id)}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: body.type, eventId: body.eventId }),
    });
    const json = await response.json().catch(() => ({ recorded: false }));
    return NextResponse.json(json, { status: response.ok ? 200 : response.status });
  } catch {
    return NextResponse.json({ recorded: false });
  }
}
