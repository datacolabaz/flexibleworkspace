import { NextRequest, NextResponse } from 'next/server';
import { updateMyProfile } from '@/lib/api-client/account';
import { readSession } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/auth/route-helpers';

/**
 * `ProfileForm` (a Client Component — it needs local input state and a
 * submit handler) can't call `getMyProfile`/`updateMyProfile` itself,
 * same reasoning as every other BFF route in this app (they're
 * `server-only`, can't read `next/headers` from a Client Component
 * anyway). Only `PATCH` — the page itself reads the initial profile via
 * SSR (`getMyProfile`, called directly from `account/profile/page.tsx`,
 * same pattern `listMyBookings` already established), so there's no
 * Client-Component GET to proxy here.
 */
export async function PATCH(request: NextRequest) {
  const { accessToken } = readSession(request.cookies);
  if (!accessToken) {
    return NextResponse.json(
      { error: { code: 'UNAUTHENTICATED', message: 'Sign in to update your profile.' } },
      { status: 401 },
    );
  }

  try {
    const body = await request.json();
    const result = await updateMyProfile(accessToken, body);
    return NextResponse.json(result);
  } catch (err) {
    return apiErrorResponse(err);
  }
}
