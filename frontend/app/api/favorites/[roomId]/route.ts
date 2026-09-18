import { NextRequest, NextResponse } from 'next/server';
import { checkFavorite, addFavorite, removeFavorite } from '@/lib/api-client/favorites';
import { readSession } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/auth/route-helpers';

/**
 * Authenticated proxy to the real `FavoritesController`'s per-room
 * endpoints (`GET`/`POST`/`DELETE /favorites/{roomId}` — none are
 * `@Public()`). A Client Component (the room detail page's bookmark
 * button) can't call `getSessionApiClient()` itself — that helper is
 * `server-only` and reads `next/headers`' `cookies()`, which only works
 * in a Server Component/Route Handler — so this Route Handler exists to
 * read the session cookie server-side and forward the bearer token,
 * mirroring `/api/search`'s BFF-proxy pattern. Returns 401 (not a thrown
 * ApiError passthrough, since there's nothing to call yet) when there's
 * no session, so the client can prompt sign-in instead of showing a
 * confusing failure.
 */
function requireAccessToken(request: NextRequest): string | NextResponse {
  const { accessToken } = readSession(request.cookies);
  if (!accessToken) {
    return NextResponse.json(
      { error: { code: 'UNAUTHENTICATED', message: 'Sign in to save favorites.' } },
      { status: 401 },
    );
  }
  return accessToken;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  const accessToken = requireAccessToken(request);
  if (typeof accessToken !== 'string') return accessToken;

  try {
    const result = await checkFavorite(accessToken, roomId);
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  const accessToken = requireAccessToken(request);
  if (typeof accessToken !== 'string') return accessToken;

  try {
    const result = await addFavorite(accessToken, roomId);
    return NextResponse.json(result);
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  const accessToken = requireAccessToken(request);
  if (typeof accessToken !== 'string') return accessToken;

  try {
    const result = await removeFavorite(accessToken, roomId);
    return NextResponse.json(result);
  } catch (err) {
    return apiErrorResponse(err);
  }
}
