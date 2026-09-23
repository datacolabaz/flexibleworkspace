'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/lib/i18n/navigation';
import { formatMoney } from '@/lib/format/money';
import { BookmarkButton } from '@/components/features/rooms/BookmarkButton';
import type { FavoriteRoomSummary } from '@/lib/api-client/favorites';

export interface FavoriteRoomCardProps {
  room: FavoriteRoomSummary;
  /** Called after the heart is toggled off — `FavoritesList` (the parent)
   * removes this card from view, since "still listed on my favorites
   * page" would contradict the heart it just emptied. Room detail's own
   * use of `BookmarkButton` has no equivalent — a room you're looking at
   * doesn't disappear when you unfavorite it. */
  onRemoved: () => void;
}

/**
 * A favorites-grid card — `FavoriteRoomSummary` is a narrower shape than
 * `RoomSummary` (no `roomType`/`verified`/distance; see
 * `lib/api-client/favorites.ts`), so this is a dedicated component rather
 * than reusing `RoomListingCard` with missing fields papered over.
 */
export function FavoriteRoomCard({ room, onRemoved }: FavoriteRoomCardProps) {
  const t = useTranslations();
  const locale = useLocale();

  const priceLabel =
    room.pricePerHour?.amount !== undefined && room.pricePerHour.currency
      ? formatMoney(room.pricePerHour.amount, room.pricePerHour.currency, locale)
      : null;

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
      <div className="relative h-36 w-full bg-surface-elevated">
        {room.coverPhotoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- remote, provider-uploaded photo URLs, same reasoning as RoomListingCard.
          <img src={room.coverPhotoUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-caption text-text-muted">
            {t('search.noPhoto')}
          </div>
        )}
        <div className="absolute right-2 top-2 rounded-full bg-surface/60 shadow-sm backdrop-blur-sm transition-colors hover:bg-surface/95 focus-within:bg-surface/95">
          {room.id && (
            <BookmarkButton roomId={room.id} initiallyFavorited={true} onToggled={(favorited) => !favorited && onRemoved()} size="sm" />
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-1 p-3">
        <Link href={room.id ? `/rooms/${room.id}` : '/search'} className="truncate text-label font-semibold text-text-primary hover:underline">
          {room.name ?? t('search.untitledRoom')}
        </Link>
        <p className="truncate text-small text-text-muted">{[room.district, room.city].filter(Boolean).join(', ')}</p>

        <div className="mt-auto flex flex-wrap items-center justify-between gap-x-2 gap-y-1 pt-1">
          <div className="flex items-center gap-1 text-small text-text-secondary">
            {room.averageRating !== undefined && room.reviewCount !== undefined && room.reviewCount > 0 ? (
              <>
                <span aria-hidden="true">★</span>
                <span>{room.averageRating.toFixed(1)}</span>
                <span className="text-text-muted">({room.reviewCount})</span>
              </>
            ) : (
              <span className="text-text-muted">{t('search.newListing')}</span>
            )}
          </div>
          {priceLabel && (
            <p className="whitespace-nowrap text-label font-semibold text-text-primary">
              {priceLabel}
              <span className="font-normal text-text-muted"> {t('search.perHour')}</span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
