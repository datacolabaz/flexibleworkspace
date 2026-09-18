import 'server-only';
import { createApiClient, unwrap, type ApiPaths } from './client';

export type AccountBookingStatusFilter = NonNullable<
  ApiPaths['/account/bookings']['get']['parameters']['query']
>['status'];

export type AccountBooking =
  ApiPaths['/account/bookings']['get']['responses']['200']['content']['application/json'][number];

/**
 * `GET /account/bookings` (`BookingsController.myBookings`, no `@Public()`
 * — every call needs a bearer token). Returns the caller's own bookings,
 * raw `BookingEntity` + `items[]` shape (same `BookingSummary` schema as
 * `GET /bookings/{bookingId}` — see the booking-flow milestone's OpenAPI
 * drift fix), optionally filtered server-side by upcoming/past/cancelled.
 * SSR-only (the `/account/bookings` page is a Server Component reading
 * the session cookie via `getSessionApiClient()`), so unlike
 * `lib/api-client/favorites.ts` this has no BFF route counterpart.
 */
export async function listMyBookings(
  accessToken: string,
  status?: AccountBookingStatusFilter,
): Promise<AccountBooking[]> {
  const client = createApiClient({ accessToken });
  const result = await client.GET('/account/bookings', {
    params: { query: status ? { status } : {} },
  });
  return unwrap(result);
}

export type Profile = ApiPaths['/account/me']['get']['responses']['200']['content']['application/json'];
export type UpdateProfileInput =
  NonNullable<ApiPaths['/account/me']['patch']['requestBody']>['content']['application/json'];

/**
 * `GET /account/me` / `PATCH /account/me` (`AccountController`, no
 * `@Public()`). `getMyProfile` is called directly from the `/account/profile`
 * Server Component page (same SSR pattern as `listMyBookings` above).
 * `updateMyProfile` is called from `app/api/account/profile/route.ts`
 * instead — `ProfileForm` (the edit form) is a Client Component and can't
 * read the session cookie itself, same reasoning as every other BFF route
 * in this app.
 */
export async function getMyProfile(accessToken: string): Promise<Profile> {
  const client = createApiClient({ accessToken });
  const result = await client.GET('/account/me');
  return unwrap(result);
}

export async function updateMyProfile(accessToken: string, input: UpdateProfileInput): Promise<Profile> {
  const client = createApiClient({ accessToken });
  const result = await client.PATCH('/account/me', { body: input });
  return unwrap(result);
}
