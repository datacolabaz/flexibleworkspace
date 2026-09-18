import { NextRequest, NextResponse } from 'next/server';
import { searchRooms, type SearchParams } from '@/lib/api-client/rooms';
import { apiErrorResponse } from '@/lib/auth/route-helpers';

const NUMERIC_PARAMS = ['durationMinutes', 'participants', 'priceMax', 'lat', 'lng', 'radiusKm', 'page', 'pageSize'] as const;
const SORT_VALUES = ['relevance', 'price', 'distance', 'rating'] as const;

/**
 * Thin public proxy to `GET /spaces` (16_SEARCH_ARCHITECTURE.md) — exists
 * so the client-rendered search page (FRONTEND_IMPLEMENTATION_PLAN.md §7)
 * can call same-origin `fetch` instead of importing `lib/api-client/rooms.ts`
 * directly, which is `server-only` and would be a build error from a
 * Client Component. No session cookie is read here — search is public —
 * but keeping it behind the BFF layer (rather than exposing
 * `BACKEND_API_URL` to the browser) matches every other data call in the
 * app and leaves room for personalized ranking later without a client
 * code change.
 *
 * Search results reflect live availability (bookings/blocks change
 * between requests), so this response is never cached.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query: SearchParams = {};

  const city = searchParams.get('city');
  if (city) query.city = city;
  const district = searchParams.get('district');
  if (district) query.district = district;
  const roomType = searchParams.get('roomType');
  if (roomType) query.roomType = roomType;
  const date = searchParams.get('date');
  if (date) query.date = date;
  const startTime = searchParams.get('startTime');
  if (startTime) query.startTime = startTime;

  const sort = searchParams.get('sort');
  if (sort && (SORT_VALUES as readonly string[]).includes(sort)) {
    query.sort = sort as SearchParams['sort'];
  }

  for (const key of NUMERIC_PARAMS) {
    const raw = searchParams.get(key);
    if (raw === null || raw === '') continue;
    const value = Number(raw);
    if (Number.isNaN(value)) continue;
    query[key] = value;
  }

  const amenities = searchParams.get('amenities');
  if (amenities) query.amenities = amenities.split(',').filter(Boolean);

  try {
    const result = await searchRooms(query);
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
