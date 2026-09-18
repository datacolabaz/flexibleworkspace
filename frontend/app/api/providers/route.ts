import { NextRequest, NextResponse } from 'next/server';
import { registerProvider } from '@/lib/api-client/providers';
import { readSession } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/auth/route-helpers';

/**
 * `ListYourSpaceForm` (a Client Component — local form state, a submit
 * handler) can't call `registerProvider` itself, same reasoning as every
 * other BFF route in this app. Only `POST` — there is no read side this
 * page needs (an already-registered provider isn't sent back here; that
 * belongs to the not-yet-built provider dashboard, out of this pass's
 * scope).
 */
export async function POST(request: NextRequest) {
  const { accessToken } = readSession(request.cookies);
  if (!accessToken) {
    return NextResponse.json(
      { error: { code: 'UNAUTHENTICATED', message: 'Sign in to register as a provider.' } },
      { status: 401 },
    );
  }

  try {
    const body = await request.json();
    const result = await registerProvider(accessToken, body);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
