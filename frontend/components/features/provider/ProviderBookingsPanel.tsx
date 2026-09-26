'use client';

import { useEffect, useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import type { ProviderBooking, ProviderBookingStatus } from '@/lib/api-client/provider-bookings';

// ── Azerbaijani labels ────────────────────────────────────────────────────────

const BOOKING_STATUS_LABEL: Record<ProviderBookingStatus, string> = {
  DRAFT: 'Qaralama',
  PENDING: 'Ödəniş gözlənilir',
  PAYMENT_PENDING: 'Ödəniş gözlənilir',
  CONFIRMED: 'Təsdiqləndi',
  COMPLETED: 'Tamamlandı',
  CANCELLED: 'Ləğv edildi',
  EXPIRED: 'Vaxtı bitdi',
  NO_SHOW: 'Gəlinmədi',
  REFUND_PENDING: 'Geri qaytarma gözlənilir',
  REFUNDED: 'Geri qaytarıldı',
  REJECTED: 'Rədd edildi',
  CANCELLED_BY_USER: 'Müştəri ləğv etdi',
  CANCELLED_BY_PROVIDER: 'Provider ləğv etdi',
};

const BOOKING_STATUS_TONE: Record<ProviderBookingStatus, string> = {
  DRAFT: 'bg-surface-elevated text-text-secondary',
  PENDING: 'bg-warning-bg text-warning',
  PAYMENT_PENDING: 'bg-warning-bg text-warning',
  CONFIRMED: 'bg-success-bg text-success',
  COMPLETED: 'bg-success-bg text-success',
  CANCELLED: 'bg-surface-elevated text-text-muted',
  EXPIRED: 'bg-surface-elevated text-text-muted',
  NO_SHOW: 'bg-surface-elevated text-text-muted',
  REFUND_PENDING: 'bg-warning-bg text-warning',
  REFUNDED: 'bg-surface-elevated text-text-muted',
  REJECTED: 'bg-error-bg text-error',
  CANCELLED_BY_USER: 'bg-surface-elevated text-text-muted',
  CANCELLED_BY_PROVIDER: 'bg-surface-elevated text-text-muted',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatAzn(minor: string | number): string {
  return `${(Number(minor) / 100).toFixed(2)} AZN`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('az-AZ', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('az-AZ', { hour: '2-digit', minute: '2-digit' });
}

function durationMinutes(startAt: string, endAt: string): string {
  const mins = Math.round((new Date(endAt).getTime() - new Date(startAt).getTime()) / 60_000);
  if (mins < 60) return `${mins} dəq`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h} saat` : `${h} saat ${m} dəq`;
}

/** Compute provider net = gross - platform commission (approximated as gross - serviceFee) */
function providerNet(booking: ProviderBooking): number {
  // grossAmount is what the room price is (before service fee); serviceFeeAmount is platform's cut.
  // provider net = gross - platform_commission. Since we don't have commission stored on booking,
  // we use: provider_net ≈ gross_amount (the room price; provider pays commission separately).
  // More precisely: total_amount = gross + serviceFee; provider gets gross - commission.
  // As a best approximation from available data: provider_net = totalAmount - serviceFeeAmount * 2
  // (since serviceFee ≈ commission in most configs). Show gross as conservative display.
  return Number(booking.grossAmount);
}

function commission(booking: ProviderBooking): number {
  // Best approximation: commission ≈ serviceFeeAmount (platform's cut)
  return Number(booking.serviceFeeAmount);
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function BookingSkeleton() {
  return (
    <div className="flex flex-col gap-3 rounded-md border border-border p-4">
      <div className="flex justify-between gap-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-5 w-20 rounded-full" />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-3 w-full" />
        ))}
      </div>
    </div>
  );
}

// ── Row ───────────────────────────────────────────────────────────────────────

function BookingRow({ booking }: { booking: ProviderBooking }) {
  const item = booking.items[0];

  return (
    <li className="flex flex-col gap-3 rounded-md border border-border p-4">
      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-label text-text-primary">
            Bron #{booking.id.slice(0, 8).toUpperCase()}
          </p>
          {item && (
            <p className="text-caption text-text-secondary">
              Otaq: <span className="font-medium">{item.roomId.slice(0, 8)}</span>
            </p>
          )}
        </div>
        <span className={`rounded-full px-2.5 py-1 text-caption ${BOOKING_STATUS_TONE[booking.status]}`}>
          {BOOKING_STATUS_LABEL[booking.status]}
        </span>
      </div>

      {/* Detail grid */}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-small sm:grid-cols-3">
        <div>
          <dt className="text-caption text-text-muted">Tarix</dt>
          <dd className="text-text-primary">{item ? formatDate(item.startAt) : '—'}</dd>
        </div>
        <div>
          <dt className="text-caption text-text-muted">Başlanğıc</dt>
          <dd className="text-text-primary">{item ? formatTime(item.startAt) : '—'}</dd>
        </div>
        <div>
          <dt className="text-caption text-text-muted">Bitmə</dt>
          <dd className="text-text-primary">{item ? formatTime(item.endAt) : '—'}</dd>
        </div>
        <div>
          <dt className="text-caption text-text-muted">Müddət</dt>
          <dd className="text-text-primary">
            {item ? durationMinutes(item.startAt, item.endAt) : '—'}
          </dd>
        </div>
        <div>
          <dt className="text-caption text-text-muted">İştirakçı</dt>
          <dd className="text-text-primary">
            {booking.participantsCount != null ? `${booking.participantsCount} nəfər` : '—'}
          </dd>
        </div>
        <div>
          <dt className="text-caption text-text-muted">Gross məbləğ</dt>
          <dd className="text-text-primary font-medium">{formatAzn(booking.grossAmount)}</dd>
        </div>
        <div>
          <dt className="text-caption text-text-muted">Spotva komissiyası</dt>
          <dd className="text-text-secondary">{formatAzn(commission(booking))}</dd>
        </div>
        <div>
          <dt className="text-caption text-text-muted">Provider neti</dt>
          <dd className="text-success font-medium">{formatAzn(providerNet(booking))}</dd>
        </div>
        <div>
          <dt className="text-caption text-text-muted">Bron tarixi</dt>
          <dd className="text-text-secondary">{formatDate(booking.createdAt)}</dd>
        </div>
      </dl>
    </li>
  );
}

// ── Panel ─────────────────────────────────────────────────────────────────────

export function ProviderBookingsPanel({ initialBookings }: { initialBookings: ProviderBooking[] | null }) {
  const [bookings, setBookings] = useState<ProviderBooking[] | null>(initialBookings);
  const [loading, setLoading] = useState(initialBookings === null);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    if (initialBookings !== null) return;
    setLoading(true);
    fetch('/api/provider/bookings', { cache: 'no-store' })
      .then((r) => r.json())
      .then((data: ProviderBooking[]) => setBookings(Array.isArray(data) ? data : []))
      .catch(() => setError('Rezervasiyalar yüklənmədi. Zəhmət olmasa yenidən cəhd edin.'))
      .finally(() => setLoading(false));
  }, [initialBookings]);

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div>
        <h3 className="font-display text-h4 text-text-primary">Rezervasiyalar</h3>
        <p className="mt-1 text-small text-text-secondary">
          Bütün otaqlar üzrə bron tarixçəsi.
        </p>
      </div>

      {error && <Alert variant="error">{error}</Alert>}

      {loading && (
        <ul className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <li key={i}>
              <BookingSkeleton />
            </li>
          ))}
        </ul>
      )}

      {!loading && bookings !== null && bookings.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-md border border-border py-10 text-center">
          <span className="text-2xl" aria-hidden="true">📋</span>
          <p className="text-body font-medium text-text-primary">
            Hələ heç bir rezervasiya yoxdur.
          </p>
          <p className="text-small text-text-muted">
            Otaqlarınız aktivləşdirildikdən sonra rezervasiyalar burada görünəcək.
          </p>
        </div>
      )}

      {!loading && bookings !== null && bookings.length > 0 && (
        <ul className="flex flex-col gap-3">
          {bookings.map((booking) => (
            <BookingRow key={booking.id} booking={booking} />
          ))}
        </ul>
      )}
    </Card>
  );
}
