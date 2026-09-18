'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/lib/i18n/navigation';
import { ReviewListItem } from './ReviewListItem';
import { ReviewableBookingCard } from './ReviewableBookingCard';
import type { Review } from '@/lib/api-client/reviews';
import type { RoomDetail } from '@/lib/api-client/rooms';

export interface ReviewableBooking {
  bookingId: string;
  roomId: string | undefined;
  dateLabel: string | undefined;
}

export interface ReviewsPanelProps {
  initialReviews: Review[];
  reviewableBookings: ReviewableBooking[];
  /** Keyed by roomId — resolved once, server-side, for every room either
   * list references (same batch-fetch-then-hand-down shape
   * `/account/bookings/page.tsx` already uses for `BookingListItem`). */
  roomsById: Record<string, RoomDetail>;
  locale: string;
}

/**
 * `/account/reviews`'s client-side owner. Combines two already-existing
 * read endpoints — `GET /reviews/me` (submitted reviews) and
 * `GET /account/bookings?status=past` (filtered server-side in the page
 * to COMPLETED bookings not yet in the reviews list) — rather than a new
 * "reviewable bookings" backend endpoint, per 05_USER_FLOWS.md §5.7's
 * documented flow: a customer can both view what they've submitted and
 * write a review for any COMPLETED-but-unreviewed booking.
 *
 * Owns both arrays as client state (seeded from the SSR page) because
 * submitting a review has to move a booking from "awaiting review" into
 * "your reviews" live, without a full page reload — the same
 * remove-from-one-list-on-success shape `FavoritesList` already uses for
 * unfavoriting.
 */
export function ReviewsPanel({ initialReviews, reviewableBookings, roomsById, locale }: ReviewsPanelProps) {
  const t = useTranslations('account.reviews');
  const [reviews, setReviews] = useState(initialReviews);
  const [toReview, setToReview] = useState(reviewableBookings);

  function handleSubmitted(review: Review) {
    setReviews((prev) => [review, ...prev]);
    setToReview((prev) => prev.filter((booking) => booking.bookingId !== review.bookingId));
  }

  if (reviews.length === 0 && toReview.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-12 text-center">
        <p className="text-label font-semibold text-text-primary">{t('emptyTitle')}</p>
        <p className="text-small text-text-secondary">{t('emptyMessage')}</p>
        <Link href="/search" className="mt-2 text-small font-semibold text-primary underline underline-offset-2">
          {t('emptyCta')}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {toReview.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-h4 font-display text-text-primary">{t('toReviewHeading')}</h2>
          <div className="flex flex-col gap-3">
            {toReview.map((booking) => (
              <ReviewableBookingCard
                key={booking.bookingId}
                bookingId={booking.bookingId}
                room={booking.roomId ? (roomsById[booking.roomId] ?? null) : null}
                dateLabel={booking.dateLabel}
                onSubmitted={handleSubmitted}
              />
            ))}
          </div>
        </section>
      )}

      {reviews.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-h4 font-display text-text-primary">{t('submittedHeading')}</h2>
          <div className="flex flex-col gap-3">
            {reviews.map((review) => (
              <ReviewListItem
                key={review.id}
                review={review}
                room={review.roomId ? (roomsById[review.roomId] ?? null) : null}
                locale={locale}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
