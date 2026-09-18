'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/lib/i18n/navigation';
import { Button } from '@/components/ui/Button';
import { WriteReviewForm } from './WriteReviewForm';
import type { Review } from '@/lib/api-client/reviews';
import type { RoomDetail } from '@/lib/api-client/rooms';

export interface ReviewableBookingCardProps {
  bookingId: string;
  room: RoomDetail | null;
  dateLabel: string | undefined;
  onSubmitted: (review: Review) => void;
}

/**
 * One card in `/account/reviews`'s "awaiting your review" section — a
 * COMPLETED booking (05_USER_FLOWS.md §5.7) that isn't in the caller's
 * `GET /reviews/me` result yet. Starts collapsed with a "write a review"
 * button; clicking it reveals `WriteReviewForm` inline for this specific
 * `bookingId`, same expand-in-place pattern as `BookmarkButton`'s
 * sign-in prompt swapping in for the heart rather than navigating away.
 */
export function ReviewableBookingCard({ bookingId, room, dateLabel, onSubmitted }: ReviewableBookingCardProps) {
  const t = useTranslations('account.reviews');
  const [writing, setWriting] = useState(false);

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <div className="flex min-w-0 flex-col">
          {room ? (
            <Link href={`/rooms/${room.id}`} className="truncate text-label font-semibold text-text-primary hover:underline">
              {room.name}
            </Link>
          ) : (
            <span className="truncate text-label font-semibold text-text-muted">{t('roomUnavailable')}</span>
          )}
          {dateLabel && <span className="text-small text-text-secondary">{dateLabel}</span>}
        </div>
        {!writing && (
          <Button type="button" variant="secondary" size="sm" onClick={() => setWriting(true)}>
            {t('toReviewCta')}
          </Button>
        )}
      </div>

      {writing && (
        <WriteReviewForm bookingId={bookingId} onSubmitted={onSubmitted} onCancel={() => setWriting(false)} />
      )}
    </div>
  );
}
