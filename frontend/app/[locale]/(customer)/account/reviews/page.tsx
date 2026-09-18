import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Alert } from '@/components/ui/Alert';
import { readSession } from '@/lib/auth/session';
import { listMyBookings } from '@/lib/api-client/account';
import { listMyReviews } from '@/lib/api-client/reviews';
import { getRoomDetail, type RoomDetail } from '@/lib/api-client/rooms';
import { ReviewsPanel, type ReviewableBooking } from '@/components/features/account/ReviewsPanel';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'account.reviews' });
  return { title: t('pageTitle') };
}

/**
 * `/account/reviews` — 06_INFORMATION_ARCHITECTURE.md §6.1, the fourth
 * `/account/*` sub-page (after bookings/favorites/profile). SSR via the
 * BFF cookie, same pattern as the other three: the parent layout already
 * redirected an unauthenticated visitor to `/login`.
 *
 * Combines two existing endpoints rather than a new "reviewable
 * bookings" one: `GET /reviews/me` (everything already submitted) and
 * `GET /account/bookings?status=past` (filtered here to `COMPLETED`
 * only — `listForCustomer`'s own status mapping also returns `NO_SHOW`
 * under "past", and `ReviewsService.create` rejects anything but
 * COMPLETED, 05_USER_FLOWS.md §5.7). A booking counts as "awaiting
 * review" when its id isn't already in the reviews list.
 */
export default async function AccountReviewsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('account.reviews');

  const { accessToken } = readSession(await cookies());
  let reviews: Awaited<ReturnType<typeof listMyReviews>> = [];
  let pastBookings: Awaited<ReturnType<typeof listMyBookings>> = [];
  let loadError = false;
  if (accessToken) {
    try {
      [reviews, pastBookings] = await Promise.all([
        listMyReviews(accessToken),
        listMyBookings(accessToken, 'past'),
      ]);
    } catch {
      loadError = true;
    }
  }

  const reviewedBookingIds = new Set(reviews.map((r) => r.bookingId).filter((id): id is string => Boolean(id)));
  const dateFormatter = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' });

  const reviewableBookings: ReviewableBooking[] = pastBookings
    .filter((booking) => booking.status === 'COMPLETED' && booking.id && !reviewedBookingIds.has(booking.id))
    .map((booking) => {
      const start = booking.items?.[0]?.startAt ? new Date(booking.items[0].startAt) : undefined;
      return {
        bookingId: booking.id as string,
        roomId: booking.items?.[0]?.roomId,
        dateLabel: start ? dateFormatter.format(start) : undefined,
      };
    });

  const distinctRoomIds = Array.from(
    new Set(
      [...reviews.map((r) => r.roomId), ...reviewableBookings.map((b) => b.roomId)].filter(
        (id): id is string => Boolean(id),
      ),
    ),
  );
  const roomEntries = await Promise.allSettled(distinctRoomIds.map((id) => getRoomDetail(id)));
  const roomsById: Record<string, RoomDetail> = {};
  roomEntries.forEach((entry, index) => {
    if (entry.status === 'fulfilled') roomsById[distinctRoomIds[index]] = entry.value;
  });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-h3 text-text-primary">{t('pageTitle')}</h1>

      {loadError ? (
        <Alert variant="error">{t('loadErrorMessage')}</Alert>
      ) : (
        <ReviewsPanel
          initialReviews={reviews}
          reviewableBookings={reviewableBookings}
          roomsById={roomsById}
          locale={locale}
        />
      )}
    </div>
  );
}
