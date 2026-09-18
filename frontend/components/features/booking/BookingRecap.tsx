import { getTranslations } from 'next-intl/server';
import type { RoomDetail } from '@/lib/api-client/rooms';
import { formatMoney } from '@/lib/format/money';

export interface BookingRecapProps {
  room: RoomDetail;
  startAt: string;
  endAt: string;
  locale: string;
}

function minutesBetween(startIso: string, endIso: string): number {
  return Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60_000);
}

function formatHours(minutes: number): string {
  const hours = minutes / 60;
  return hours % 1 === 0 ? String(hours) : hours.toFixed(1);
}

/**
 * A read-only recap of what's being booked — the room, and the exact
 * window `BookingWidget` handed off, not re-editable here (the go-ahead's
 * phasing keeps time selection on the room detail page; changing it means
 * going back, which the widget's data already supports via browser back).
 * Server Component: no interactivity, so it renders with the page rather
 * than adding a second client bundle.
 */
export async function BookingRecap({ room, startAt, endAt, locale }: BookingRecapProps) {
  const t = await getTranslations('booking');
  const durationMinutes = minutesBetween(startAt, endAt);
  const dateFormatter = new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short' });
  const timeFormatter = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' });
  const start = new Date(startAt);
  const end = new Date(endAt);
  const coverPhoto = room.photos?.[0];

  return (
    <div className="flex gap-4 rounded-lg border border-border bg-surface p-4">
      {coverPhoto ? (
        // eslint-disable-next-line @next/next/no-img-element -- external, provider-hosted photo URLs; no next/image domain allowlist entry exists for arbitrary provider hosts yet (matches RoomGallery's own choice).
        <img
          src={coverPhoto}
          alt=""
          className="h-20 w-20 shrink-0 rounded-md object-cover"
        />
      ) : (
        <div className="h-20 w-20 shrink-0 rounded-md bg-surface-elevated" aria-hidden="true" />
      )}
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="truncate font-display text-h4 text-text-primary">{room.name}</h1>
        <p className="text-small text-text-secondary">{[room.district, room.city].filter(Boolean).join(', ')}</p>
        <p className="text-small text-text-primary">
          {dateFormatter.format(start)} · {timeFormatter.format(start)}–{timeFormatter.format(end)}
        </p>
        <p className="text-small text-text-muted">{t('durationValue', { hours: formatHours(durationMinutes) })}</p>
        {room.pricePerHour?.amount !== undefined && room.pricePerHour.currency && (
          <p className="text-small text-text-muted">
            {formatMoney(room.pricePerHour.amount, room.pricePerHour.currency, locale)} {t('perHourSuffix')}
          </p>
        )}
      </div>
    </div>
  );
}
