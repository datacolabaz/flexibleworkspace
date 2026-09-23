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

  const hasCapacity = room.capacityMin !== undefined && room.capacityMax !== undefined;
  const hasRating = room.averageRating !== undefined && room.reviewCount !== undefined && room.reviewCount > 0;

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
    //
    // Stacked (photo on top, full width) rather than the old side-by-side
    // layout — a fixed-width thumbnail next to a wide text column left a
    // large empty gap to the right of short text on anything but a very
    // narrow list pane (flagged directly against a live screenshot of the
    // search results page: "Cowork-A card çox boşdur"). A full-width
    // photo also reads as the primary content instead of competing with
    // it, matching how every comparable marketplace card (Airbnb,
    // Peerspace) treats the photo as dominant.
    <div
      onMouseEnter={() => onHoverChange?.(room.id)}
      onMouseLeave={() => onHoverChange?.(undefined)}
      className={[
        'group flex flex-col overflow-hidden rounded-lg border bg-surface shadow-sm transition-colors hover:border-border-strong hover:shadow-md',
        highlighted ? 'border-primary' : 'border-border',
      ].join(' ')}
    >
      <div className="relative aspect-[4/3] w-full shrink-0 overflow-hidden bg-surface-elevated">
        <Link href={href} className="block h-full w-full" tabIndex={-1} aria-hidden="true">
          {room.coverPhotoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- remote, provider-uploaded photo URLs (not a fixed local set next/image's domain allowlist assumes); revisit once the storage domain is finalized.
            <img
              src={room.coverPhotoUrl}
              alt=""
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-caption text-text-muted">
              {t('search.noPhoto')}
            </div>
          )}
        </Link>
        {room.verified && (
          // The checkmark and label are separate spans (not one text run)
          // so the label's own text content stays exactly the translated
          // string — matches how tests/room-listing-card.test.tsx already
          // queries for it by exact text, and keeps the glyph decorative
          // (aria-hidden) rather than read aloud by a screen reader.
          <Badge variant="verified" className="pointer-events-none absolute left-2 top-2 shadow-sm">
            <span aria-hidden="true">✓</span>
            <span>{t('search.verified')}</span>
          </Badge>
        )}
        {room.id && (
          // Ghost circle (translucent, not a flat opaque fill) with a
          // small shadow instead of the old solid bg-surface/90 disc —
          // that read as a heavy, deliberately-placed UI chrome element
          // sitting on top of the photo rather than a lightweight
          // favorite toggle; darkening to a solid surface only on
          // hover/focus keeps the resting state quiet (also flagged
          // directly: "ürək... zorla yerləşdirilmiş kimi görünür").
          <div className="absolute right-2 top-2 rounded-full bg-surface/60 shadow-sm backdrop-blur-sm transition-colors hover:bg-surface/95 focus-within:bg-surface/95">
            <BookmarkButton roomId={room.id} initiallyFavorited={initiallyFavorited ?? null} size="sm" />
          </div>
        )}
      </div>

      <Link href={href} className="flex min-w-0 flex-1 flex-col gap-1 p-3">
        <h3 className="truncate text-label font-semibold text-text-primary">{room.name ?? t('search.untitledRoom')}</h3>
        <p className="truncate text-small text-text-secondary">
          {roomTypeLabel}
          {(room.district || room.city) && <> · {[room.district, room.city].filter(Boolean).join(', ')}</>}
        </p>

        {/* Secondary metadata line — capacity (the one RoomSummary field
         * the old card never surfaced) plus rating/distance, so the card
         * carries the compare-at-a-glance signals a marketplace listing
         * needs rather than just name + price. Amenity chips from the
         * user's mockup aren't here: the search API's RoomSummary doesn't
         * return amenities per-listing (only RoomDetail does) — adding
         * that is a backend change, out of scope for this pass. */}
        {(hasCapacity || hasRating || (room.distanceKm !== undefined && room.distanceKm !== null)) && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-caption text-text-muted">
            {hasCapacity && (
              <span>
                <span aria-hidden="true">👥</span> {t('room.capacityValue', { min: room.capacityMin, max: room.capacityMax })}
              </span>
            )}
            {hasCapacity && (hasRating || (room.distanceKm !== undefined && room.distanceKm !== null)) && <span aria-hidden="true">·</span>}
            {hasRating && (
              <span className="inline-flex items-center gap-1">
                <span aria-hidden="true">★</span>
                <span>{room.averageRating!.toFixed(1)}</span>
                <span>({room.reviewCount})</span>
              </span>
            )}
            {hasRating && room.distanceKm !== undefined && room.distanceKm !== null && <span aria-hidden="true">·</span>}
            {room.distanceKm !== undefined && room.distanceKm !== null && <span>{t('search.distanceKm', { distance: room.distanceKm })}</span>}
          </div>
        )}

        {!hasRating && (
          <p className="text-caption text-text-muted">{t('search.newListing')}</p>
        )}

        {/* Price is the card's other headline number (alongside the
         * photo) — sized up from the old shared-line treatment, with a
         * quiet arrow that only appears on hover as a "view details"
         * affordance (matches the mockup's bottom row: price left,
         * chevron right). */}
        <div className="mt-auto flex items-end justify-between gap-2 pt-2">
          {priceLabel ? (
            <p className="whitespace-nowrap text-text-primary">
              <span className="text-h4 font-display font-semibold">{priceLabel}</span>
              <span className="text-caption text-text-muted"> {t('search.perHour')}</span>
            </p>
          ) : (
            <span />
          )}
          <span
            aria-hidden="true"
            className="pb-0.5 text-text-muted opacity-0 transition-all duration-150 group-hover:translate-x-0.5 group-hover:text-primary group-hover:opacity-100"
          >
            →
          </span>
        </div>
      </Link>
    </div>
  );
}
