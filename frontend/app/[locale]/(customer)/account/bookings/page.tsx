import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/lib/i18n/navigation';
import { Alert } from '@/components/ui/Alert';
import { readSession } from '@/lib/auth/session';
import { listMyBookings, type AccountBookingStatusFilter } from '@/lib/api-client/account';
import { getRoomDetail, type RoomDetail } from '@/lib/api-client/rooms';
import { BookingListItem } from '@/components/features/account/BookingListItem';

const FILTERS: { value: AccountBookingStatusFilter | undefined; labelKey: string }[] = [
  { value: undefined, labelKey: 'filterAll' },
  { value: 'upcoming', labelKey: 'filterUpcoming' },
  { value: 'past', labelKey: 'filterPast' },
  { value: 'cancelled', labelKey: 'filterCancelled' },
];

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'account.bookings' });
  return { title: t('pageTitle') };
}

/**
 * `/account/bookings` — 06_INFORMATION_ARCHITECTURE.md §6.1. SSR via the
 * BFF cookie (FRONTEND_IMPLEMENTATION_PLAN.md §4): the parent layout
 * already redirected an unauthenticated visitor to `/login`, so the
 * access-token cookie is expected to be present here — the `undefined`
 * fallback below is defense against the narrow window where a token
 * expires between the layout's check and this page's render, not the
 * common case, so it degrades to an empty list rather than crashing.
 */
export default async function AccountBookingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { locale } = await params;
  const { status: rawStatus } = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations('account.bookings');

  const status: AccountBookingStatusFilter =
    rawStatus === 'upcoming' || rawStatus === 'past' || rawStatus === 'cancelled' ? rawStatus : undefined;

  const { accessToken } = readSession(await cookies());
  let bookings: Awaited<ReturnType<typeof listMyBookings>> = [];
  let loadError = false;
  if (accessToken) {
    try {
      bookings = await listMyBookings(accessToken, status);
    } catch {
      loadError = true;
    }
  }

  const distinctRoomIds = Array.from(
    new Set(bookings.map((b) => b.items?.[0]?.roomId).filter((id): id is string => Boolean(id))),
  );
  const roomEntries = await Promise.allSettled(distinctRoomIds.map((id) => getRoomDetail(id)));
  const roomsById = new Map<string, RoomDetail>();
  roomEntries.forEach((entry, index) => {
    if (entry.status === 'fulfilled') roomsById.set(distinctRoomIds[index], entry.value);
  });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-h3 text-text-primary">{t('pageTitle')}</h1>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((filter) => {
          const active = (status ?? undefined) === filter.value;
          const href = filter.value ? `/account/bookings?status=${filter.value}` : '/account/bookings';
          return (
            <Link
              key={filter.labelKey}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={[
                'min-h-9 rounded-full border px-3 py-1 text-small font-medium transition-colors',
                active
                  ? 'border-primary bg-primary text-primary-on'
                  : 'border-border text-text-secondary hover:border-border-strong',
              ].join(' ')}
            >
              {t(filter.labelKey)}
            </Link>
          );
        })}
      </div>

      {loadError && <Alert variant="error">{t('loadErrorMessage')}</Alert>}

      {!loadError && bookings.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-12 text-center">
          <p className="text-label font-semibold text-text-primary">{t('emptyTitle')}</p>
          <p className="text-small text-text-secondary">{t('emptyMessage')}</p>
          <Link href="/search" className="mt-2 text-small font-semibold text-primary underline underline-offset-2">
            {t('emptyCta')}
          </Link>
        </div>
      )}

      {!loadError && bookings.length > 0 && (
        <div className="flex flex-col gap-3">
          {bookings.map((booking) => (
            <BookingListItem
              key={booking.id}
              booking={booking}
              room={booking.items?.[0]?.roomId ? (roomsById.get(booking.items[0].roomId) ?? null) : null}
              locale={locale}
            />
          ))}
        </div>
      )}
    </div>
  );
}
