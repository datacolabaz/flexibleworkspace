import 'server-only';
import { createApiClient, unwrap, type ApiPaths } from './client';

export type CreateCheckoutBody = ApiPaths['/payments']['post']['requestBody']['content']['application/json'];
export type CheckoutSession = ApiPaths['/payments']['post']['responses']['200']['content']['application/json'];

/**
 * `POST /payments` (13_PAYMENT_ARCHITECTURE.md §13.3) — `@Public()` on
 * the real controller: a guest who just created a booking has no
 * session, and `PaymentsService.createCheckoutSession` only checks
 * ownership when a caller id is present, so `accessToken` is optional
 * here, same shape as `lib/api-client/bookings.ts`'s `createBooking`.
 */
export async function createCheckoutSession(
  body: CreateCheckoutBody,
  accessToken?: string,
): Promise<CheckoutSession> {
  const client = createApiClient({ accessToken });
  const result = await client.POST('/payments', { body });
  return unwrap(result);
}

export type PaymentHistoryEntry =
  ApiPaths['/account/payments']['get']['responses']['200']['content']['application/json'][number];

/**
 * `GET /account/payments` (`PaymentsController.listMyPayments`, no
 * `@Public()`). One row per checkout attempt on the caller's own
 * bookings, with its transaction history and any refund against that
 * booking nested in — see `PaymentsService.listForCustomer`'s own doc
 * comment for why a booking can have more than one row (a failed-then-
 * retried checkout). SSR-only, called directly from the
 * `/account/payment-history` Server Component page, same pattern as
 * `listMyBookings`/`getMyProfile`/`listMyReviews`.
 */
export async function listMyPayments(accessToken: string): Promise<PaymentHistoryEntry[]> {
  const client = createApiClient({ accessToken });
  const result = await client.GET('/account/payments');
  return unwrap(result);
}
