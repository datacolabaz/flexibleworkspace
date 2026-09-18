import 'server-only';
import { createApiClient, unwrap, type ApiPaths } from './client';

export type FavoriteStatus = ApiPaths['/favorites/{roomId}']['get']['responses']['200']['content']['application/json'];
export type FavoriteRoomSummary =
  ApiPaths['/favorites/me']['get']['responses']['200']['content']['application/json'][number];

/**
 * Thin, request-scoped wrappers around the real, already-shipped
 * `FavoritesController` (`/favorites/{roomId}` — all authenticated, no
 * `@Public()`). Every call here needs a bearer token, so callers always
 * pass an `accessToken` (read from the session cookie by the BFF route
 * that calls these — see `app/api/favorites/[roomId]/route.ts`); there is
 * no anonymous variant, unlike `searchRooms`/`getRoomDetail`.
 */
/**
 * `GET /favorites/me` — the signed-in customer's saved rooms, most-
 * recently-favorited first. Returns `FavoriteRoomSummary[]`, a narrower
 * shape than `RoomSummary` (no `roomType`/`verified`/`capacityMin,Max`/
 * `lat,lng`/`available`/`relevanceScore` — `FavoritesService.listForUser`'s
 * raw SQL join doesn't select those columns; see the room-detail
 * milestone's OpenAPI drift fix for the full reasoning).
 */
export async function listFavorites(accessToken: string): Promise<FavoriteRoomSummary[]> {
  const client = createApiClient({ accessToken });
  const result = await client.GET('/favorites/me');
  return unwrap(result);
}

export async function checkFavorite(accessToken: string, roomId: string): Promise<FavoriteStatus> {
  const client = createApiClient({ accessToken });
  const result = await client.GET('/favorites/{roomId}', { params: { path: { roomId } } });
  return unwrap(result);
}

export async function addFavorite(accessToken: string, roomId: string) {
  const client = createApiClient({ accessToken });
  const result = await client.POST('/favorites/{roomId}', { params: { path: { roomId } } });
  return unwrap(result);
}

export async function removeFavorite(accessToken: string, roomId: string) {
  const client = createApiClient({ accessToken });
  const result = await client.DELETE('/favorites/{roomId}', { params: { path: { roomId } } });
  return unwrap(result);
}
