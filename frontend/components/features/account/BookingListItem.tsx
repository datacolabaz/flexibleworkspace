import { getTranslations } from 'next-intl/server';
import { Link } from '@/lib/i18n/navigation';
import { Badge, type BadgeVariant } from '@/components/ui/Badge';
import { formatMoney } from '@/lib/format/money';
import type { AccountBooking } from '@/lib/api-client/account';
import type { RoomDetail } from '@/lib/api-client/rooms';

export interface BookingListItemProps {
  booking: AccountBooking;
  /** The room `booking.items[0].roomId` resolves to, or `null` when the
   * lookup failed (room deleted, or the batch fetch errored for this
   * one) — rendered with a generic fallback rather than failing the
   * whole list over one bad room. */
  room: RoomDetail | null;
  locale: string;
}

// Same booking-status enum `BookingsController`/`AvailabilityService`
// share across the app (12_RESERVATION_ENGINE.md §12.3's state machine).
// Duplicated here rather than imported from BookingFailedView.tsx, which
// doesn't export its own copy — both are small, stable, two-status sets
// unlikely to drift independently.
const PAYABLE_STATUSES = new Set(['PENDING', 'PAYMENT_PENDING']);

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  CONFIRMED: 'success',
  COMPLETED: 'success',
  PENDING: 'warning',
  PAYMENT_PENDING: 'warning',
  REFUND_PENDING: 'warning',
  CANCELLED: 'error',
  EXPIRED: 'error',
  NO_SHOW: 'error',
  DRAFT: 'neutral',
  REFUNDED: 'neutral',
};

/**
 * One row of `/account/bookings` — a Server Component (no interactivity
 * needed; the one action, "complete payment," is a plain link to the
 * already-built `/booking/{id}/failed` retry flow, not a new one).
 *
 * `AccountBooking` (the `BookingSummary` schema) carries only
 * `items[].roomId`, no room name/photo — `listForCustomer`'s query never
 * joins through to `room`/`location`/`photo` (12_RESERVATION_ENGINE.md
 * §12.3's booking/booking_item tables are deliberately denormalized only
 * as far as pricing, not display). The page batch-fetches `RoomDetail`
 * per distinct `roomId` and hands the result down here rather than this
 * component fetching per-row, which would serialize N requests instead
 * of running them in parallel.
 */
export async function BookingListItem({ booking, room, locale }: BookingListItemProps) {
  const t = await getTranslations('account.bookings');
  const primaryItem = booking.items?.[0];
  const extraItemsCount = (booking.items?.length ?? 0) - 1;
  const status = booking.status ?? 'DRAFT';

  const dateFormatter = new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const timeFormatter = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' });
  const start = primaryItem?.startAt ? new Date(primaryItem.startAt) : undefined;
  const end = primaryItem?.endAt ? new Date(primaryItem.endAt) : undefined;

  const totalLabel =
    booking.totalAmount !== undefined && booking.currency
      ? formatMoney(booking.totalAmount, booking.currency, locale)
      : undefined;

  return (
    <div className="flex gap-4 rounded-lg border border-border bg-surface p-4">
      <div className="h-20 w-20 shrink-0 overflow-hidden rounded-md bg-surface-elevated">
        {room?.coverPhotoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- remote, provider-uploaded photo URLs, same reasoning as RoomListingCard/BookingRecap.
          <img src={room.coverPhotoUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : null}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
          {room ? (
            <Link href={`/rooms/${room.id}`} className="truncate text-label font-semibold text-text-primary hover:underline">
              {room.name}
            </Link>
          ) : (
            <span className="truncate text-label font-semibold text-text-muted">{t('roomUnavailable')}</span>
          )}
          <Badge variant={STATUS_VARIANT[status] ?? 'neutral'}>{t(`statusLabel.${status}`)}</Badge>
        </div>

        {room && <p className="truncate text-small text-text-secondary">{[room.district, room.city].filter(Boolean).join(', ')}</p>}

        {start && end && (
          <p className="text-small text-text-primary">
            {dateFormatter.format(start)} · {timeFormatter.format(start)}–{timeFormatter.format(end)}
          </p>
        )}
        {extraItemsCount > 0 && (
          <p className="text-caption text-text-muted">{t('moreSpaces', { count: extraItemsCount })}</p>
        )}

        <div className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-1 pt-1">
          {totalLabel && (
            <p className="text-label font-semibold text-text-primary">
              {t('totalLabel')}: {totalLabel}
            </p>
          )}
          {PAYABLE_STATUSES.has(status) && booking.id && (
            // A plain <a>, not the i18n-aware `Link` above — `/booking/*`
            // is deliberately NOT locale-prefixed (middleware.ts excludes
            // it; its exact shape is dictated by the payment provider's
            // successUrl/errorUrl config), so `Link` would wrongly prepend
            // this locale and 404.
            <a
              href={`/booking/${booking.id}/failed`}
              className="text-small font-semibold text-primary underline underline-offset-2 hover:no-underline"
            >
              {t('completePaymentCta')}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
