import { NextRequest, NextResponse } from 'next/server';
import { createReview } from '@/lib/api-client/reviews';
import { readSession } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/auth/route-helpers';

/**
 * `WriteReviewForm` (a Client Component — it needs local rating/text
 * state and a submit handler) can't call `createReview` itself, same
 * reasoning as every other BFF route in this app. Only `POST` — the
 * `/account/reviews` page reads the caller's existing reviews via SSR
 * (`listMyReviews`, called directly from the page, same pattern
 * `getMyProfile` already established), so there's no Client-Component
 * GET to proxy here.
 */
export async function POST(request: NextRequest) {
  const { accessToken } = readSession(request.cookies);
  if (!accessToken) {
    return NextResponse.json(
      { error: { code: 'UNAUTHENTICATED', message: 'Sign in to write a review.' } },
      { status: 401 },
    );
  }

  try {
    const body = await request.json();
    const result = await createReview(accessToken, body);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
