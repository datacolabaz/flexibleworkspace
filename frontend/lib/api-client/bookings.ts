import 'server-only';
import { createApiClient, unwrap, type ApiPaths } from './client';

export type CreateBookingBody = ApiPaths['/bookings']['post']['requestBody']['content']['application/json'];
export type BookingSummary = ApiPaths['/bookings']['post']['responses']['201']['content']['application/json'];

/**
 * `POST /bookings` — `@Public()` on the real controller (guest checkout,
 * 05_USER_FLOWS.md §5.2): `accessToken` is passed when the caller has a
 * session, but is entirely optional here. When absent, `dto.customer`
 * must carry an email or phone or the backend rejects with 400
 * `CUSTOMER_REQUIRED` — enforced server-side only
 * (`CreateBookingDto.customer` is `@IsOptional()`), which is why the BFF
 * route below still lets a request through without a customer object and
 * relies on the backend's own error to surface a clear message.
 */
export async function createBooking(
  body: CreateBookingBody,
  accessToken?: string,
): Promise<BookingSummary> {
  const client = createApiClient({ accessToken });
  const result = await client.POST('/bookings', { body });
  return unwrap(result);
}

/**
 * `GET /bookings/{bookingId}` — also `@Public()` with optional auth (the
 * `bookings.controller.ts` fix made this milestone): possession of the
 * opaque booking UUID is the gate for a guest, so `accessToken` is
 * optional here too. Used both by the (currently authenticated-only)
 * account area later and by the payment-confirmation page, which a guest
 * reaches with no session at all.
 */
export async function getBooking(bookingId: string, accessToken?: string): Promise<BookingSummary> {
  const client = createApiClient({ accessToken });
  const result = await client.GET('/bookings/{bookingId}', { params: { path: { bookingId } } });
  return unwrap(result);
}
