import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { getRoomDetail } from '@/lib/api-client/rooms';
import { getSessionApiClient, readSession } from '@/lib/auth/session';
import { listMyRooms } from '@/lib/api-client/provider-rooms';
import { ApiError } from '@/lib/api-client/client';
import { formatMoney } from '@/lib/format/money';
import { roomTypeKeyFromTranslationKey } from '@/lib/constants/taxonomy';
import { Badge } from '@/components/ui/Badge';
import { RoomGallery } from '@/components/features/rooms/RoomGallery';
import { AmenitiesList } from '@/components/features/rooms/AmenitiesList';
import { CancellationPolicyCard } from '@/components/features/rooms/CancellationPolicyCard';
import { RoomLocationMap } from '@/components/features/rooms/RoomLocationMap';
import { HostInfoCard } from '@/components/features/rooms/HostInfoCard';
import { LeadCaptureForm } from '@/components/features/rooms/LeadCaptureForm';
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

  // Best-effort "is this my own listing" check — a provider had no way to
  // find their way to editing a room from its own public page, only from
  // the separate /provider dashboard's room list (which they'd have to
  // already know about and go find the right room in). Reuses the
  // existing provider-rooms list rather than exposing providerId on the
  // public RoomDetail response — a signed-out visitor or a non-provider
  // account simply never matches (listMyRooms 403s for those, caught
  // below), and any other failure degrades the same soft way as the
  // favorite check above.
  let isOwnRoom = false;
  const { accessToken } = readSession(await cookies());
  if (accessToken) {
    try {
      const myRooms = await listMyRooms(accessToken);
      isOwnRoom = myRooms.some((myRoom) => myRoom.id === id);
    } catch (err) {
      console.error('Best-effort own-room check failed (page still renders normally):', err);
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

  const hasPrice = room.pricePerHour?.amount !== undefined && Boolean(room.pricePerHour.currency);

  return (
    <main
      id="main-content"
      className={`mx-auto max-w-7xl px-4 py-6 sm:px-6 ${hasPrice ? 'pb-24 lg:pb-6' : ''}`}
    >
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
          {isOwnRoom && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
              <p className="text-small font-medium text-text-primary">{t('ownerListingBanner')}</p>
              <a
                href={`/provider#room-${id}`}
                className="inline-flex min-h-9 shrink-0 items-center justify-center rounded-md bg-accent px-4 text-label font-semibold text-accent-on transition-colors hover:bg-accent-hover"
              >
                {t('ownerListingEditCta')}
              </a>
            </div>
          )}

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
           * facts strip. `scroll-mt-24` gives the fixed sticky bar's
           * "Bron et" anchor link room to land below the sticky header
           * (h-16) rather than right underneath it. 07_UX_ARCHITECTURE.md
           * §7.4's fixed bottom-docked bar is `MobileBookingBar` below —
           * previously deferred (PHASE4_REPORT.md); this closes that gap. */}
          <div id="booking-widget" className="scroll-mt-24 lg:hidden">
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
            {room.rules && (
              <p className="whitespace-pre-line rounded-md border border-border bg-surface-elevated p-3 text-small text-text-secondary">
                {room.rules}
              </p>
            )}
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

          {/* Sprint 3, Lead Tracking — a soft "express interest" path
           * alongside the booking widget: a visitor who isn't ready to
           * book yet can leave their name/phone and the provider follows
           * up manually. No payment involved (standing decision: no live
           * payment gateway pre-launch). */}
          <LeadCaptureForm roomId={id} />
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

      {/* Fixed bottom-docked mobile CTA (07_UX_ARCHITECTURE.md §7.4) — a
       * plain anchor to #booking-widget, not a client component: no JS
       * needed for the browser's native same-page scroll, and it keeps
       * this page a pure Server Component. Hidden once the inline mobile
       * widget's own price line has scrolled past (peers can't do that
       * without JS), so instead this simply stays docked for the whole
       * scroll — same as the reference "sticky checkout bar" pattern —
       * and `hasPrice` already keeps it from rendering when there's
       * nothing to show or book. */}
      {hasPrice && room.pricePerHour && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] lg:hidden">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
            <div>
              <p className="text-h4 font-display text-text-primary">
                {formatMoney(room.pricePerHour.amount!, room.pricePerHour.currency!, locale)}
                <span className="text-small font-normal text-text-muted"> {t('perHour')}</span>
              </p>
              {room.averageRating !== undefined && room.reviewCount !== undefined && room.reviewCount > 0 && (
                <p className="text-caption text-text-muted">
                  ★ {room.averageRating.toFixed(1)} ({room.reviewCount})
                </p>
              )}
            </div>
            <a
              href="#booking-widget"
              className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-md bg-accent px-6 text-label font-semibold text-accent-on transition-colors hover:bg-accent-hover"
            >
              {t('bookCta')}
            </a>
          </div>
        </div>
      )}
    </main>
  );
}
