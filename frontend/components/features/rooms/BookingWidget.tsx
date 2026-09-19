'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/lib/i18n/navigation';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatMoney } from '@/lib/format/money';
import type { RoomAvailability } from '@/lib/api-client/rooms';

export interface BookingWidgetProps {
  roomId: string;
  pricePerHour: { amount?: number; currency?: string } | null | undefined;
  minBookingMinutes: number | null | undefined;
  maxBookingMinutes: number | null | undefined;
}

type Slot = NonNullable<RoomAvailability['slots']>[number];
type FetchState = { status: 'idle' | 'loading' | 'success' | 'error'; slots: Slot[] };

const STEP_MINUTES = 30;

// A window's own `startAt` (from AvailabilityService.getOpenWindows) can be
// the literal earliest-bookable instant — for a room with no minimum-notice
// policy, that's effectively "now" — and the backend never caches windows,
// recomputing "now" fresh on every request (12_RESERVATION_ENGINE.md
// §12.1). Offering that exact instant as the first selectable start time
// means any normal time spent picking a duration and filling the guest
// contact fields pushes the real submit past it, so the backend's own
// re-validation (`AvailabilityService.isRangeAvailable`) correctly, but
// unhelpfully, rejects it as SLOT_UNAVAILABLE. Found live while
// smoke-testing the booking flow (PHASE4_REPORT.md) — this pads the
// earliest *offered* start time by a realistic form-completion buffer so
// the common case doesn't race the clock; it doesn't change what's
// actually bookable (a genuinely later window is untouched), and a very
// slow visitor can still hit the same race in principle — the booking
// form's own SLOT_UNAVAILABLE error state (with a link back to pick again)
// is the backstop for that residual case, not a client-side timer.
const START_TIME_LEAD_BUFFER_MINUTES = 10;

function todayLocalDate(): string {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10);
}

function minutesBetween(startIso: string, endIso: string): number {
  return Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60_000);
}

function addMinutes(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
}

function formatTime(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

/**
 * "Sifariş Paneli (Booking Widget Sidebar)": price display, date/time
 * selection, and a CTA to the next phase — explicitly NOT a call to
 * `POST /bookings` (the user's own plan phrases the CTA as a hand-off to
 * "the next phase (Booking flow)", a separate milestone). Links to
 * `/rooms/{id}/book?...`, which isn't built yet and will 404 — same
 * precedent as `RoomListingCard`'s link to this very page before this
 * milestone existed: the real link ships now, flagged rather than worked
 * around.
 *
 * Time/duration picking works against the real availability model
 * (`AvailabilityService.getOpenWindows`): the backend returns open
 * windows, not pre-sliced fixed slots, so this widget picks a start time
 * (stepped every 30 min) and a duration within the chosen window,
 * client-side-validated against `[minBookingMinutes, maxBookingMinutes]`.
 * Times are formatted in the viewer's own browser timezone — `RoomDetail`
 * exposes no location-timezone field to format in venue-local time
 * instead (flagged in PHASE4_REPORT.md; low-risk for a Baku-only V1 where
 * most customers share the venue's timezone).
 *
 * The price shown is explicitly an *estimate* (07_UX_ARCHITECTURE.md
 * §7.5 labels this exact appearance "room detail (estimate)", distinct
 * from the booking panel's later "live" breakdown) — the service-fee
 * percentage is a server-side config value
 * (`booking.serviceFeePercentage`, `BookingsService.create`) with no
 * public endpoint exposing it, so this shows the subtotal plus a note
 * that a service fee is added at checkout, rather than fabricating a
 * fee number the backend never confirmed.
 */
export function BookingWidget({ roomId, pricePerHour, minBookingMinutes, maxBookingMinutes }: BookingWidgetProps) {
  const t = useTranslations('room');
  const locale = useLocale();

  const [date, setDate] = useState(todayLocalDate());
  const [state, setState] = useState<FetchState>({ status: 'idle', slots: [] });
  const [selectedWindowIndex, setSelectedWindowIndex] = useState<number | null>(null);
  const [startAt, setStartAt] = useState<string | null>(null);
  const [durationMinutes, setDurationMinutes] = useState<number | null>(null);

  const minMinutes = minBookingMinutes ?? STEP_MINUTES;
  const maxMinutes = maxBookingMinutes ?? minMinutes;
  const price =
    pricePerHour?.amount !== undefined && pricePerHour.currency
      ? { amount: pricePerHour.amount, currency: pricePerHour.currency }
      : null;

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading', slots: [] });
    setSelectedWindowIndex(null);
    setStartAt(null);
    setDurationMinutes(null);

    fetch(`/api/rooms/${roomId}/availability?date=${date}`, { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Availability request failed with status ${res.status}`);
        return (await res.json()) as RoomAvailability;
      })
      .then((data) => {
        if (!cancelled) setState({ status: 'success', slots: data.slots ?? [] });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error', slots: [] });
      });

    return () => {
      cancelled = true;
    };
  }, [roomId, date]);

  const selectedWindow = selectedWindowIndex !== null ? state.slots[selectedWindowIndex] : null;

  const startOptions = useMemo(() => {
    if (!selectedWindow?.startAt || !selectedWindow?.endAt) return [];
    const options: string[] = [];
    const windowMinutes = minutesBetween(selectedWindow.startAt, selectedWindow.endAt);
    const windowStartMs = new Date(selectedWindow.startAt).getTime();
    const earliestSafeMs = Date.now() + START_TIME_LEAD_BUFFER_MINUTES * 60_000;
    const leadOffset = Math.max(
      0,
      Math.ceil((earliestSafeMs - windowStartMs) / (STEP_MINUTES * 60_000)) * STEP_MINUTES,
    );
    for (let offset = leadOffset; offset + minMinutes <= windowMinutes; offset += STEP_MINUTES) {
      options.push(addMinutes(selectedWindow.startAt, offset));
    }
    return options;
  }, [selectedWindow, minMinutes]);

  const durationOptions = useMemo(() => {
    if (!startAt || !selectedWindow?.endAt) return [];
    const available = minutesBetween(startAt, selectedWindow.endAt);
    const cap = Math.min(maxMinutes, available);
    const options: number[] = [];
    for (let d = minMinutes; d <= cap; d += STEP_MINUTES) options.push(d);
    return options;
  }, [startAt, selectedWindow, minMinutes, maxMinutes]);

  const endAt = startAt && durationMinutes ? addMinutes(startAt, durationMinutes) : null;
  const subtotal = price && durationMinutes ? Math.round((price.amount * durationMinutes) / 60) : null;

  const bookHref =
    startAt && endAt
      ? `/rooms/${roomId}/book?startAt=${encodeURIComponent(startAt)}&endAt=${encodeURIComponent(endAt)}`
      : undefined;

  return (
    <div className="sticky top-20 flex flex-col gap-4 rounded-lg border border-border bg-surface p-4 shadow-sm">
      {price && (
        <p className="text-h3 font-display text-text-primary">
          {formatMoney(price.amount, price.currency, locale)}
          <span className="text-small font-normal text-text-muted"> {t('perHour')}</span>
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="booking-date" className="text-small font-semibold text-text-primary">
          {t('dateLabel')}
        </label>
        <input
          id="booking-date"
          type="date"
          min={todayLocalDate()}
          value={date}
          onChange={(event) => setDate(event.target.value)}
          className="min-h-11 rounded-md border border-border-strong bg-surface px-3 text-body text-text-primary"
        />
      </div>

      {state.status === 'loading' && (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      )}

      {state.status === 'error' && <Alert variant="error">{t('availabilityError')}</Alert>}

      {state.status === 'success' && state.slots.length === 0 && (
        <p className="text-small text-text-secondary">{t('noAvailability')}</p>
      )}

      {state.status === 'success' && state.slots.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-small font-semibold text-text-primary">{t('windowLabel')}</span>
          <div className="flex flex-wrap gap-2">
            {state.slots.map((slot, index) => {
              if (!slot.startAt || !slot.endAt) return null;
              const isSelected = index === selectedWindowIndex;
              return (
                <button
                  key={slot.startAt}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => {
                    setSelectedWindowIndex(index);
                    setStartAt(null);
                    setDurationMinutes(null);
                  }}
                  className={[
                    'min-h-11 rounded-md border px-3 text-small transition-colors',
                    isSelected
                      ? 'border-primary bg-primary text-primary-on'
                      : 'border-border-strong bg-surface text-text-primary hover:bg-surface-elevated',
                  ].join(' ')}
                >
                  {formatTime(slot.startAt, locale)}–{formatTime(slot.endAt, locale)}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {selectedWindow && startOptions.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="booking-start" className="text-small font-semibold text-text-primary">
            {t('startTimeLabel')}
          </label>
          <select
            id="booking-start"
            value={startAt ?? ''}
            onChange={(event) => {
              setStartAt(event.target.value || null);
              setDurationMinutes(null);
            }}
            className="min-h-11 rounded-md border border-border-strong bg-surface px-3 text-body text-text-primary"
          >
            <option value="">{t('startTimePlaceholder')}</option>
            {startOptions.map((iso) => (
              <option key={iso} value={iso}>
                {formatTime(iso, locale)}
              </option>
            ))}
          </select>
        </div>
      )}

      {startAt && durationOptions.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="booking-duration" className="text-small font-semibold text-text-primary">
            {t('durationLabel')}
          </label>
          <select
            id="booking-duration"
            value={durationMinutes ?? ''}
            onChange={(event) => setDurationMinutes(event.target.value ? Number(event.target.value) : null)}
            className="min-h-11 rounded-md border border-border-strong bg-surface px-3 text-body text-text-primary"
          >
            <option value="">{t('durationPlaceholder')}</option>
            {durationOptions.map((minutes) => (
              <option key={minutes} value={minutes}>
                {t('durationHours', { hours: (minutes / 60).toFixed(minutes % 60 === 0 ? 0 : 1) })}
              </option>
            ))}
          </select>
        </div>
      )}

      {subtotal !== null && price && (
        <div className="flex flex-col gap-1 border-t border-border pt-3 text-small">
          <div className="flex items-center justify-between text-text-secondary">
            <span>{t('estimatedTotal')}</span>
            <span className="font-semibold text-text-primary">{formatMoney(subtotal, price.currency, locale)}</span>
          </div>
          <p className="text-caption text-text-muted">{t('serviceFeeNote')}</p>
        </div>
      )}

      {bookHref ? (
        // Links to the not-yet-built booking-flow route rather than
        // calling `POST /bookings` here — see this component's doc
        // comment. Styled to match <Button variant="primary" fullWidth>
        // since an <a> can't be a <button>'s `disabled` sibling state.
        <Link
          href={bookHref}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-accent px-5 text-label font-semibold text-accent-on transition-colors hover:bg-accent-hover"
        >
          {t('bookCta')}
        </Link>
      ) : (
        <Button variant="primary" fullWidth disabled>
          {t('bookCta')}
        </Button>
      )}
    </div>
  );
}
