import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { getRoomDetail } from '@/lib/api-client/rooms';
import { getSessionApiClient } from '@/lib/auth/session';
import { ApiError } from '@/lib/api-client/client';
import { formatMoney } from '@/lib/format/money';
import { roomTypeKeyFromTranslationKey } from '@/lib/constants/taxonomy';
import { Badge } from '@/components/ui/Badge';
import { RoomGallery } from '@/components/features/rooms/RoomGallery';
import { AmenitiesList } from '@/components/features/rooms/AmenitiesList';
import { CancellationPolicyCard } from '@/components/features/rooms/CancellationPolicyCard';
import { RoomLocationMap } from '@/components/features/rooms/RoomLocationMap';
import { HostInfoCard } from '@/components/features/rooms/HostInfoCard';
import { BookingWidget } from '@/components/features/rooms/BookingWidget';
import { BookmarkButton } from '@/components/features/rooms/BookmarkButton';
import { ShareButton } from '@/components/features/rooms/ShareButton';

/**
 * `/{locale}/rooms/{id}` — SSR (FRONTEND_IMPLEMENTATION_PLAN.md §19.3: room
 * detail needs SSR for SEO, unlike the client-rendered search page).
 *
 * The ideal route is `/{locale}/rooms/{slug}-{id}` (19_SEO.md), but
 * neither `RoomSummary` nor `RoomDetail` exposes a `slug` field anywhere
 * in the real API (checked `search.service.ts`'s SQL and
 * `29_API_OPENAPI.yaml`) even though the `room` table has one — this is
 * the same gap `RoomListingCard`'s link comment already flagged before
 * this page existed. Building the id-only route here keeps that link
 * working exactly as written, rather than a slug route that would need
 * data the backend doesn't return.
 */
async function loadRoom(id: string) {
  try {
    return await getRoomDetail(id);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      notFound();
    }
    throw err;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  try {
    const room = await getRoomDetail(id);
    return {
      title: room.name,
      description: room.description ?? undefined,
    };
  } catch {
    // A 404 (or any other fetch failure) here just falls back to a
    // generic title — the page body's own loadRoom() call is what
    // actually renders the 404, `generateMetadata` never throws.
    return {};
  }
}

export default async function RoomDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('room');
  const tSearch = await getTranslations('search');
  const tTaxonomy = await getTranslations('taxonomy');

  const room = await loadRoom(id);

  // Soft, best-effort initial favorite check — a signed-out visitor gets
  // `null` (BookmarkButton treats that as "not favorited" until they sign
  // in), and any failure here (e.g. an expired access token) degrades the
  // same way rather than failing the whole page render.
  let initiallyFavorited: boolean | null = null;
  const sessionClient = await getSessionApiClient();
  if (sessionClient) {
    try {
      const result = await sessionClient.GET('/favorites/{roomId}', { params: { path: { roomId: id } } });
      initiallyFavorited = result.data?.favorited ?? null;
    } catch (err) {
      console.error('Best-effort initial favorite check failed (bookmark button still works):', err);
    }
  }

  const roomTypeKey = roomTypeKeyFromTranslationKey(room.roomType);
  // `tTaxonomy` is scoped to the top-level `taxonomy` namespace (sibling
  // of `search`, not nested under it) — `tSearch('taxonomy.roomType....')`
  // resolved to the nonexistent `search.taxonomy.roomType.*` and threw
  // MISSING_MESSAGE (caught live testing this page: a Server Component
  // render error, not silently swallowed).
  const roomTypeLabel = roomTypeKey ? tTaxonomy(`roomType.${roomTypeKey}`) : room.roomType;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  const pageUrl = siteUrl ? `${siteUrl}/${locale}/rooms/${id}` : `/${locale}/rooms/${id}`;

  return (
    <main id="main-content" className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      {/* 19_SEO.md: "Room detail pages emit LocalBusiness/Product-style
       * structured data (price, availability, rating, address)". Built
       * from data already fetched for the human-readable page — no extra
       * request. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Product',
            name: room.name,
            description: room.description ?? undefined,
            image: room.photos ?? undefined,
            url: pageUrl,
            ...(room.pricePerHour?.amount !== undefined && room.pricePerHour.currency
              ? {
                  offers: {
                    '@type': 'Offer',
                    price: (room.pricePerHour.amount / 100).toFixed(2),
                    priceCurrency: room.pricePerHour.currency,
                  },
                }
              : {}),
            ...(room.averageRating && room.reviewCount
              ? {
                  aggregateRating: {
                    '@type': 'AggregateRating',
                    ratingValue: room.averageRating,
                    reviewCount: room.reviewCount,
                  },
                }
              : {}),
          }),
        }}
      />

      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-6">
          <RoomGallery photos={room.photos ?? []} roomName={room.name ?? ''} />

          <div className="flex flex-col gap-2">
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="font-display text-h2 text-text-primary">{room.name ?? tSearch('untitledRoom')}</h1>
                  {room.verified && <Badge variant="verified">{tSearch('verified')}</Badge>}
                </div>
                <p className="text-body text-text-secondary">{roomTypeLabel}</p>
                <p className="text-small text-text-muted">{[room.district, room.city].filter(Boolean).join(', ')}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <ShareButton title={room.name ?? ''} url={pageUrl} />
                <BookmarkButton roomId={id} initiallyFavorited={initiallyFavorited} />
              </div>
            </div>

            {/* Key facts strip — 07_UX_ARCHITECTURE.md §7.4. */}
            <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2 rounded-lg border border-border bg-surface p-4 text-small">
              {room.capacityMin !== undefined && room.capacityMax !== undefined && (
                <div>
                  <p className="text-text-muted">{t('capacity')}</p>
                  <p className="font-semibold text-text-primary">{t('capacityValue', { min: room.capacityMin, max: room.capacityMax })}</p>
                </div>
              )}
              {room.sizeSqm !== undefined && room.sizeSqm !== null && (
                <div>
                  <p className="text-text-muted">{t('size')}</p>
                  <p className="font-semibold text-text-primary">{t('sizeValue', { sqm: room.sizeSqm })}</p>
                </div>
              )}
              {room.averageRating !== undefined && room.reviewCount !== undefined && room.reviewCount > 0 && (
                <div>
                  <p className="text-text-muted">{t('rating')}</p>
                  <p className="font-semibold text-text-primary">
                    ★ {room.averageRating.toFixed(1)} ({room.reviewCount})
                  </p>
                </div>
              )}
              {room.pricePerHour?.amount !== undefined && room.pricePerHour.currency && (
                <div>
                  <p className="text-text-muted">{t('priceLabel')}</p>
                  <p className="font-semibold text-text-primary">{formatMoney(room.pricePerHour.amount, room.pricePerHour.currency, locale)}</p>
                </div>
              )}
            </div>
          </div>

          {/* Mobile booking widget: rendered inline, right after the key
           * facts strip, so the primary CTA never needs a long scroll to
           * reach — 07_UX_ARCHITECTURE.md §7.4 calls for a fixed
           * bottom-docked bar on mobile specifically; that's deferred as
           * a polish item (PHASE4_REPORT.md) in favor of this simpler,
           * still-reachable placement within this milestone's scope. */}
          <div className="lg:hidden">
            <BookingWidget
              roomId={id}
              pricePerHour={room.pricePerHour}
              minBookingMinutes={room.minBookingMinutes}
              maxBookingMinutes={room.maxBookingMinutes}
            />
          </div>

          {room.description && (
            <section className="flex flex-col gap-2">
              <h2 className="font-display text-h4 text-text-primary">{t('descriptionTitle')}</h2>
              <p className="whitespace-pre-line text-body text-text-secondary">{room.description}</p>
            </section>
          )}

          <section className="flex flex-col gap-2">
            <h2 className="font-display text-h4 text-text-primary">{t('amenitiesTitle')}</h2>
            <AmenitiesList amenities={room.amenities ?? []} />
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="font-display text-h4 text-text-primary">{t('rulesTitle')}</h2>
            <CancellationPolicyCard cancellationPolicy={room.cancellationPolicy} />
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="font-display text-h4 text-text-primary">{t('locationTitle')}</h2>
            <RoomLocationMap lat={room.lat} lng={room.lng} roomName={room.name ?? ''} className="h-72 w-full" />
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="font-display text-h4 text-text-primary">{t('hostTitle')}</h2>
            <HostInfoCard providerName={room.providerName} verified={room.verified} />
          </section>
        </div>

        <div className="hidden w-full shrink-0 lg:block lg:w-[360px]">
          <BookingWidget
            roomId={id}
            pricePerHour={room.pricePerHour}
            minBookingMinutes={room.minBookingMinutes}
            maxBookingMinutes={room.maxBookingMinutes}
          />
        </div>
      </div>
    </main>
  );
}
