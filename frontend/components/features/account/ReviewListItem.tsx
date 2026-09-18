'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/lib/i18n/navigation';
import { Badge } from '@/components/ui/Badge';
import { StarRatingDisplay } from '@/components/ui/StarRating';
import type { Review } from '@/lib/api-client/reviews';
import type { RoomDetail } from '@/lib/api-client/rooms';

export interface ReviewListItemProps {
  review: Review;
  /** The room `review.roomId` resolves to, or `null` when the lookup
   * failed (room deleted, or the batch fetch errored for this one) —
   * same "resolve to null, render a fallback" contract `BookingListItem`
   * already uses for `/account/bookings`. */
  room: RoomDetail | null;
  locale: string;
}

/**
 * One row of `/account/reviews`'s "your reviews" section. Unlike
 * `BookingListItem` (a Server Component — no interactivity needed
 * there), this needs `useTranslations`'s client hook because it renders
 * inside `ReviewsPanel`, a Client Component (the panel owns the
 * write-review flow's state, so everything under it is part of the same
 * client tree) — `getTranslations` (the Server Component / async
 * equivalent `BookingListItem` uses) isn't callable from here.
 *
 * `review.moderationStatus` is shown here (unlike the public
 * `GET /spaces/{roomId}/reviews`, which is APPROVED-only and never
 * surfaces the field) — a REJECTED review is still the customer's own
 * content, and `ReviewsService.listForCustomer`'s own doc comment says
 * they're entitled to see what happened to it, same "own data, not
 * filtered by an internal status flag" principle `AccountService
 * .getProfile` already follows.
 */
export function ReviewListItem({ review, room, locale }: ReviewListItemProps) {
  const t = useTranslations('account.reviews');

  const dateFormatter = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' });
  const createdLabel = review.createdAt ? dateFormatter.format(new Date(review.createdAt)) : undefined;

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        {room ? (
          <Link href={`/rooms/${room.id}`} className="truncate text-label font-semibold text-text-primary hover:underline">
            {room.name}
          </Link>
        ) : (
          <span className="truncate text-label font-semibold text-text-muted">{t('roomUnavailable')}</span>
        )}
        {review.moderationStatus === 'REJECTED' && <Badge variant="error">{t('moderationStatus.REJECTED')}</Badge>}
        {review.moderationStatus === 'PENDING' && <Badge variant="warning">{t('moderationStatus.PENDING')}</Badge>}
      </div>

      <div className="flex items-center gap-2">
        <StarRatingDisplay rating={review.rating ?? 0} label={t('ratingAriaLabel', { rating: review.rating ?? 0 })} />
        {createdLabel && <span className="text-small text-text-muted">{t('reviewedOn', { date: createdLabel })}</span>}
      </div>

      {review.text && <p className="text-body text-text-secondary">{review.text}</p>}

      {review.moderationStatus === 'REJECTED' && (
        <p className="text-small text-text-muted">{t('rejectedNote')}</p>
      )}

      {review.providerReplyText && (
        <div className="mt-1 flex flex-col gap-1 rounded-md bg-surface-elevated p-3">
          <p className="text-caption font-semibold uppercase tracking-wide text-text-muted">{t('providerReplyLabel')}</p>
          <p className="text-small text-text-secondary">{review.providerReplyText}</p>
        </div>
      )}
    </div>
  );
}
