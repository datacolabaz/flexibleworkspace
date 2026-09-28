import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/lib/auth/session';
import { ApiError } from '@/lib/api-client/client';
import { apiErrorResponse } from '@/lib/auth/route-helpers';

/**
 * Thin proxy to `POST /payments/{paymentId}/fake-complete`. The backend
 * 404s this in production; the browser never confirms a booking itself.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ paymentId: string }> },
) {
  const { paymentId } = await params;
  const { accessToken } = readSession(request.cookies);

  const backendBase = process.env.BACKEND_API_URL;
  if (!backendBase) {
    return NextResponse.json(
      { error: { code: 'BFF_INTERNAL_ERROR', message: 'BACKEND_API_URL is not set.' } },
      { status: 502 },
    );
  }

  let body: { signature?: string } = {};
  try {
    body = (await request.json()) as { signature?: string };
  } catch {
    body = {};
  }

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    const res = await fetch(`${backendBase}/payments/${paymentId}/fake-complete`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new ApiError(res.status, json);
    }
    return NextResponse.json(json, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
