import 'server-only';
import { createApiClient, unwrap, type ApiPaths } from './client';

export type SearchParams = NonNullable<ApiPaths['/spaces']['get']['parameters']['query']>;
export type SearchRoomsResult = ApiPaths['/spaces']['get']['responses']['200']['content']['application/json'];
export type RoomDetail = ApiPaths['/spaces/{roomId}']['get']['responses']['200']['content']['application/json'];
export type RoomAvailability =
  ApiPaths['/spaces/{roomId}/availability']['get']['responses']['200']['content']['application/json'];

/**
 * Public, unauthenticated search — the reference example for how
 * feature code should call the backend: build query params from the
 * OpenAPI-derived parameter type (so an unsupported filter is a compile
 * error, not a silently-ignored query string), call through the shared
 * client, unwrap to data-or-throw. Server Components call this directly
 * (RSC + native fetch, per the go-ahead — no TanStack Query); a
 * client-rendered filter UI would call it through a Route Handler
 * instead of importing this server-only module.
 */
export async function searchRooms(params: SearchParams = {}): Promise<SearchRoomsResult> {
  const client = createApiClient();
  const result = await client.GET('/spaces', { params: { query: params } });
  return unwrap(result);
}

export async function getRoomDetail(roomId: string): Promise<RoomDetail> {
  const client = createApiClient();
  const result = await client.GET('/spaces/{roomId}', { params: { path: { roomId } } });
  return unwrap(result);
}

/**
 * `GET /spaces/{roomId}/availability?date=...` — open windows for one
 * local calendar date (BookingsController.getAvailability /
 * AvailabilityService.getOpenWindows). Takes only `roomId` + `date`; there
 * is no `durationMinutes` param on the real endpoint (a previously-
 * documented one was doc-only drift, removed from 29_API_OPENAPI.yaml
 * while building the room detail page's booking widget — see
 * PHASE4_REPORT.md). Picking a specific start time/duration within a
 * returned window is the caller's job, validated against
 * `RoomDetail.minBookingMinutes`/`maxBookingMinutes`.
 */
export async function getRoomAvailability(roomId: string, date: string): Promise<RoomAvailability> {
  const client = createApiClient();
  const result = await client.GET('/spaces/{roomId}/availability', {
    params: { path: { roomId }, query: { date } },
  });
  return unwrap(result);
}
