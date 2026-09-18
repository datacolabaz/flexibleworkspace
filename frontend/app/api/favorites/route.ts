import { NextRequest, NextResponse } from 'next/server';
import { listFavorites } from '@/lib/api-client/favorites';
import { readSession } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/auth/route-helpers';

/**
 * A Client Component proxy to `GET /favorites/me`, distinct from
 * `/api/favorites/[roomId]`'s per-room check/toggle routes. Built for
 * `SearchResultsView` (a Client Component — search results are
 * deliberately client-rendered per FRONTEND_IMPLEMENTATION_PLAN.md §7,
 * so it can't call `getSessionApiClient()` itself) to learn which of the
 * current results are already favorited, so `RoomListingCard` can render
 * a correctly-filled heart on first paint instead of every card starting
 * unfavorited and silently being wrong until clicked.
 *
 * Deliberately returns 200 with an empty list for a signed-out visitor
 * rather than `/api/favorites/[roomId]`'s 401 — this route is a passive,
 * best-effort background check the search page always makes, not a
 * user-initiated action a 401 should interrupt with a sign-in prompt.
 * "Nothing favorited" and "not signed in" render identically anyway (no
 * filled hearts), so there's no case that needs telling apart.
 */
export async function GET(request: NextRequest) {
  const { accessToken } = readSession(request.cookies);
  if (!accessToken) {
    return NextResponse.json({ roomIds: [] }, { headers: { 'Cache-Control': 'no-store' } });
  }

  try {
    const favorites = await listFavorites(accessToken);
    const roomIds = favorites.map((room) => room.id).filter((id): id is string => Boolean(id));
    return NextResponse.json({ roomIds }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
