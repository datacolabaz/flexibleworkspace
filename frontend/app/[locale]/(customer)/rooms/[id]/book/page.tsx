import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from '@/lib/i18n/navigation';
import { getRoomDetail } from '@/lib/api-client/rooms';
import { getSessionApiClient } from '@/lib/auth/session';
import { ApiError } from '@/lib/api-client/client';
import { BookingForm } from '@/components/features/booking/BookingForm';
import { BookingRecap } from '@/components/features/booking/BookingRecap';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'booking' });
  return { title: t('pageTitle') };
}

/**
 * `/{locale}/rooms/{id}/book` — the hand-off `BookingWidget`'s CTA links
 * to (07_UX_ARCHITECTURE.md §7.4/§7.5's "booking panel (live)" screen,
 * distinct from the room detail page's "estimate"). Reached only with
 * `startAt`/`endAt` query params already chosen against a real open
 * window — there is no independent time picker here, matching the go-
 * ahead's phasing ("CTA to next phase" was explicitly deferred rather
 * than building a second picker).
 *
 * A visit without valid params (hand-typed URL, stale/expired link) sends
 * the visitor back to the room page rather than rendering a broken form —
 * there's nothing useful to recover here since the availability window
 * that produced these params isn't re-validated until submit anyway (the
 * backend's own live availability + exclusion-constraint check,
 * 12_RESERVATION_ENGINE.md §12.2, is authoritative either way).
 */
export default async function BookRoomPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ startAt?: string; endAt?: string }>;
}) {
  const { locale, id } = await params;
  const { startAt, endAt } = await searchParams;
  setRequestLocale(locale);

  let room;
  try {
    room = await getRoomDetail(id);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  const startDate = startAt ? new Date(startAt) : null;
  const endDate = endAt ? new Date(endAt) : null;
  const validRange =
    startDate && endDate && !Number.isNaN(startDate.getTime()) && !Number.isNaN(endDate.getTime()) && endDate > startDate;

  if (!validRange) {
    redirect({ href: `/rooms/${id}`, locale });
  }

  // Best-effort — mirrors the room detail page's own soft session check.
  // `BookingForm` only needs to know whether to show the guest-contact
  // fields at all; it never sees the token itself (server-only client).
  let isAuthenticated = false;
  const sessionClient = await getSessionApiClient();
  if (sessionClient) isAuthenticated = true;

  return (
    <main id="main-content" className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <div className="flex flex-col gap-6">
        <BookingRecap room={room} startAt={startAt as string} endAt={endAt as string} locale={locale} />
        <BookingForm
          roomId={id}
          startAt={startAt as string}
          endAt={endAt as string}
          pricePerHour={room.pricePerHour ?? null}
          isAuthenticated={isAuthenticated}
          capacityMin={room.capacityMin}
          capacityMax={room.capacityMax}
        />
      </div>
    </main>
  );
}
