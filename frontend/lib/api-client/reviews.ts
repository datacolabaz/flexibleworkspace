import 'server-only';
import { createApiClient, unwrap, type ApiPaths } from './client';

export type Review = ApiPaths['/reviews/me']['get']['responses']['200']['content']['application/json'][number];

export type CreateReviewInput =
  ApiPaths['/reviews']['post']['requestBody']['content']['application/json'];

/**
 * `GET /reviews/me` (`ReviewsController.listMine`, no `@Public()` — every
 * call needs a bearer token). Returns the caller's own submitted reviews
 * in any moderation status (unlike the public `GET /spaces/{roomId}/reviews`,
 * which is APPROVED-only) — a REJECTED review is still the customer's own
 * content. SSR-only, called directly from the `/account/reviews` Server
 * Component page, same pattern as `listMyBookings`/`getMyProfile` in
 * `lib/api-client/account.ts`.
 */
export async function listMyReviews(accessToken: string): Promise<Review[]> {
  const client = createApiClient({ accessToken });
  const result = await client.GET('/reviews/me');
  return unwrap(result);
}

/**
 * `POST /reviews` (`ReviewsController.create`). Only ever called from
 * `app/api/reviews/route.ts` — `WriteReviewForm` is a Client Component
 * (local rating/text state, a submit handler) and can't read the session
 * cookie itself, same reasoning as `updateMyProfile`'s BFF-only call
 * pattern in `lib/api-client/account.ts`.
 */
export async function createReview(accessToken: string, input: CreateReviewInput): Promise<Review> {
  const client = createApiClient({ accessToken });
  const result = await client.POST('/reviews', { body: input });
  return unwrap(result);
}
