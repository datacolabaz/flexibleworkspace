import { NextRequest, NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/auth/route-helpers';

const BACKEND = process.env.BACKEND_API_URL?.replace(/\/$/, '') ?? '';

export async function GET(request: NextRequest) {
  const ids = request.nextUrl.searchParams.get('ids') ?? '';
  try {
    const res = await fetch(`${BACKEND}/spaces/compare?ids=${encodeURIComponent(ids)}`, {
      cache: 'no-store',
    });
    const body = await res.json();
    return NextResponse.json(body, { status: res.status, headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
