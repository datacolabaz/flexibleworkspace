'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/lib/i18n/navigation';
import { Badge } from '@/components/ui/Badge';
import { formatMoney } from '@/lib/format/money';
import { roomTypeKeyFromTranslationKey } from '@/lib/constants/taxonomy';
import { BookmarkButton } from './BookmarkButton';
import type { SearchRoomsResult } from '@/lib/api-client/rooms';

export type RoomSummary = NonNullable<SearchRoomsResult['results']>[number];

export interface RoomListingCardProps {
  room: RoomSummary;
  /** Highlights the card when its map marker is hovered/selected, and
   * vice versa (08_DESIGN_SYSTEM.md §8.6: "Synced list + map split view"
   * on desktop) — undefined outside a map-paired context (e.g. a future
   * "Popular near you" homepage rail), where no sync is wired up. */
  highlighted?: boolean;
  onHoverChange?: (roomId: string | undefined) => void;
  /** Whether this room is already favorited by the signed-in visitor, or
   * `null`/`undefined` when unknown (still loading, or the visitor is
   * signed out — `BookmarkButton` treats either the same as `false` and
   * self-corrects via its own toggle response). See the account-area
   * milestone's `/account/favorites` for the same "narrower shape than
   * RoomSummary" data source (`GET /favorites/me`) this reads from,
   * fetched by the caller (`SearchResultsView`) rather than here — one
   * request for a whole results page, not one per card. */
  initiallyFavorited?: boolean | null;
}

/**
 * 08_DESIGN_SYSTEM.md §8.2: "the single most-reused component in the
 * product — photo, price, rating, distance, verified badge, favorite
 * toggle." The favorite toggle is `BookmarkButton` (the same component
 * the room detail page uses), overlaid on the photo's top-right corner —
 * added once `/account/favorites` existed to make its own "is this room
 * already favorited" check reusable here (previously deferred; see
 * PHASE4_REPORT.md's Room Detail and `/account`-area sections for the
 * gap this closes).
 *
 * Links to `/rooms/{id}` — RoomSummary has no `slug` field (only
 * RoomDetail-adjacent data would), so this is the id-only form of the
 * FRONTEND_IMPLEMENTATION_PLAN.md §7 `/{locale}/rooms/{slug}-{id}` route.
 * That page isn't built yet (next milestone), so this 404s for now —
 * flagged rather than worked around, same discipline as every other
 * documented gap this phase.
 */
export function RoomListingCard({ room, highlighted = false, onHoverChange, initiallyFavorited }: RoomListingCardProps) {
  const t = useTranslations();
  const locale = useLocale();

  const roomTypeKey = roomTypeKeyFromTranslationKey(room.roomType);
  const roomTypeLabel = roomTypeKey ? t(`taxonomy.roomType.${roomTypeKey}`) : room.roomType;
  const priceLabel =
    room.pricePerHour?.amount !== undefined && room.pricePerHour.currency
      ? formatMoney(room.pricePerHour.amount, room.pricePerHour.currency, locale)
      : null;

  const href = room.id ? `/rooms/${room.id}` : '/search';

  return (
    // Not a single outer <Link> (as this was before the favorite toggle
    // was added) — nesting BookmarkButton's <button> inside an <a> is
    // invalid HTML (interactive content can't nest), and would also
    // trigger the card's own navigation on every heart click via event
    // bubbling. Split into two <Link>s to the same href (photo, text) —
    // a common card pattern — with BookmarkButton as a sibling overlay
    // on the photo, never inside either Link. Hover/highlight sync with
    // the map moves to this outer <div> so it still covers the whole
    // card, not just its clickable regions.
    <div
      onMouseEnter={() => onHoverChange?.(room.id)}
      onMouseLeave={() => onHoverChange?.(undefined)}
      className={[
        'flex gap-4 rounded-lg border bg-surface p-3 shadow-sm transition-colors hover:border-border-strong',
        highlighted ? 'border-primary' : 'border-border',
      ].join(' ')}
    >
      <div className="relative h-28 w-36 shrink-0 overflow-hidden rounded-md bg-surface-elevated sm:h-32 sm:w-44">
        <Link href={href} className="block h-full w-full" tabIndex={-1} aria-hidden="true">
          {room.coverPhotoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- remote, provider-uploaded photo URLs (not a fixed local set next/image's domain allowlist assumes); revisit once the storage domain is finalized.
            <img src={room.coverPhotoUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-caption text-text-muted">
              {t('search.noPhoto')}
            </div>
          )}
        </Link>
        {room.verified && (
          <Badge variant="verified" className="pointer-events-none absolute left-2 top-2">
            {t('search.verified')}
          </Badge>
        )}
        {room.id && (
          <div className="absolute right-2 top-2 rounded-full bg-surface/90 backdrop-blur-sm">
            <BookmarkButton roomId={room.id} initiallyFavorited={initiallyFavorited ?? null} />
          </div>
        )}
      </div>

      <Link href={href} className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="truncate text-h4 font-display text-text-primary">{room.name ?? t('search.untitledRoom')}</h3>
        </div>
        <p className="text-small text-text-secondary">{roomTypeLabel}</p>
        <p className="truncate text-small text-text-muted">
          {[room.district, room.city].filter(Boolean).join(', ')}
          {room.distanceKm !== undefined && room.distanceKm !== null && (
            <> · {t('search.distanceKm', { distance: room.distanceKm })}</>
          )}
        </p>

        {/* flex-wrap (not nowrap-and-hope): at very narrow card widths
         * (a 390px viewport, minus the fixed-width photo) the rating and
         * price blocks don't both fit on one line — wrapping the price
         * onto its own line keeps it fully visible instead of pushing it
         * past the card's right edge (08_DESIGN_SYSTEM.md §8.6, no
         * horizontal overflow at 390/375px — caught live, same class of
         * bug as the header's 390px overflow fix). */}
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
      </Link>
    </div>
  );
}
