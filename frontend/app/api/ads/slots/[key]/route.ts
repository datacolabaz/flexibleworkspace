import { NextRequest, NextResponse } from 'next/server';
import { getAdSlot } from '@/lib/api-client/ads';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  return NextResponse.json(await getAdSlot(key));
}
