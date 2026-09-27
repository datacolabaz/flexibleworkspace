'use client';

import { useEffect, useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import type { ProviderBooking, ProviderBookingStatus } from '@/lib/api-client/provider-bookings';

const BOOKING_STATUS_LABEL: Record<ProviderBookingStatus, string> = {
  DRAFT: 'Qaralama',
  PENDING: 'Təsdiq gözlənilir',
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

const REJECT_REASONS = [
  { value: 'ROOM_UNAVAILABLE', label: 'Bu saat artıq doludur.' },
  { value: 'SCHEDULE_CONFLICT', label: 'Platformadan kənar rezervasiya var.' },
  { value: 'CAPACITY_MISMATCH', label: 'Tutum uyğun deyil.' },
  { value: 'INVALID_REQUEST_DETAILS', label: 'Provider uyğun deyil.' },
  { value: 'OTHER', label: 'Digər.' },
] as const;

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

function ledgerAmount(value: string | number | null | undefined): number | null {
  if (value == null || value === '') return null;
  return Number(value);
}

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

function BookingRow({
  booking,
  onUpdated,
}: {
  booking: ProviderBooking;
  onUpdated: (next: ProviderBooking) => void;
}) {
  const item = booking.items[0];
  const gross = ledgerAmount(booking.ledgerGrossAmount);
  const fee = ledgerAmount(booking.ledgerPlatformFeeAmount);
  const net = ledgerAmount(booking.ledgerProviderNetAmount);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState<(typeof REJECT_REASONS)[number]['value']>('ROOM_UNAVAILABLE');
  const [note, setNote] = useState('');
  const pendingRequest = booking.mode === 'REQUEST_BASED' && booking.status === 'PENDING';

  async function accept() {
    setBusy(true);
    setError(undefined);
    try {
      const res = await fetch(`/api/provider/bookings/${booking.id}/accept`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError('Sorğunu qəbul etmək mümkün olmadı.');
        return;
      }
      onUpdated(body as ProviderBooking);
    } catch {
      setError('Sorğunu qəbul etmək mümkün olmadı.');
    } finally {
      setBusy(false);
    }
  }

  async function reject() {
    if (reason === 'OTHER' && !note.trim()) {
      setError('“Digər” üçün qeyd tələb olunur.');
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const res = await fetch(`/api/provider/bookings/${booking.id}/reject`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason, note: note.trim() || undefined }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError('Sorğunu rədd etmək mümkün olmadı.');
        return;
      }
      onUpdated(body as ProviderBooking);
      setRejectOpen(false);
    } catch {
      setError('Sorğunu rədd etmək mümkün olmadı.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="flex flex-col gap-3 rounded-md border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-label text-text-primary">Bron #{booking.id.slice(0, 8).toUpperCase()}</p>
          <p className="text-caption text-text-secondary">
            {(booking.locationName || booking.roomName) && (
              <>
                {booking.locationName}
                {booking.locationName && booking.roomName ? ' · ' : ''}
                {booking.roomName}
              </>
            )}
            {!booking.locationName && !booking.roomName && item && (
              <>
                Otaq: <span className="font-medium">{item.roomId.slice(0, 8)}</span>
              </>
            )}
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-caption ${BOOKING_STATUS_TONE[booking.status]}`}>
          {BOOKING_STATUS_LABEL[booking.status]}
        </span>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-small sm:grid-cols-3">
        <div>
          <dt className="text-caption text-text-muted">Müştəri</dt>
          <dd className="text-text-primary">{booking.customerDisplayName || '—'}</dd>
        </div>
        <div>
          <dt className="text-caption text-text-muted">E-poçt</dt>
          <dd className="text-text-primary break-all">{booking.customerEmail || '—'}</dd>
        </div>
        {booking.status !== 'PENDING' && (
          <div>
            <dt className="text-caption text-text-muted">Telefon</dt>
            <dd className="text-text-primary">{booking.customerPhone || '—'}</dd>
          </div>
        )}
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
          <dd className="text-text-primary">{item ? durationMinutes(item.startAt, item.endAt) : '—'}</dd>
        </div>
        <div>
          <dt className="text-caption text-text-muted">İştirakçı</dt>
          <dd className="text-text-primary">
            {booking.participantsCount != null ? `${booking.participantsCount} nəfər` : '—'}
          </dd>
        </div>
        <div>
          <dt className="text-caption text-text-muted">İlkin qiymət</dt>
          <dd className="text-text-primary font-medium">{formatAzn(booking.totalAmount)}</dd>
        </div>
        <div>
          <dt className="text-caption text-text-muted">Qeyd</dt>
          <dd className="text-text-primary">{booking.purpose || '—'}</dd>
        </div>
        <div>
          <dt className="text-caption text-text-muted">Hold bitmə</dt>
          <dd className="text-text-secondary">
            {booking.holdExpiresAt ? `${formatDate(booking.holdExpiresAt)} ${formatTime(booking.holdExpiresAt)}` : '—'}
          </dd>
        </div>
        <div>
          <dt className="text-caption text-text-muted">Gross məbləğ</dt>
          <dd className="text-text-primary font-medium">
            {gross != null ? formatAzn(gross) : formatAzn(booking.grossAmount)}
          </dd>
        </div>
        <div>
          <dt className="text-caption text-text-muted">Spotva komissiyası</dt>
          <dd className="text-text-secondary">{fee != null ? formatAzn(fee) : '—'}</dd>
        </div>
        <div>
          <dt className="text-caption text-text-muted">Provider neti</dt>
          <dd className="text-success font-medium">{net != null ? formatAzn(net) : '—'}</dd>
        </div>
      </dl>

      {error && <Alert variant="error">{error}</Alert>}

      {pendingRequest && (
        <div className="flex flex-col gap-3 border-t border-border pt-3">
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" disabled={busy} onClick={accept}>
              Qəbul et
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => setRejectOpen((open) => !open)}>
              Rədd et
            </Button>
          </div>
          {rejectOpen && (
            <div className="flex flex-col gap-2">
              <label className="text-small text-text-secondary" htmlFor={`reject-reason-${booking.id}`}>
                Səbəb
              </label>
              <select
                id={`reject-reason-${booking.id}`}
                className="min-h-11 rounded-md border border-border bg-surface px-3 text-small"
                value={reason}
                onChange={(event) => setReason(event.target.value as typeof reason)}
              >
                {REJECT_REASONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              {reason === 'OTHER' && (
                <textarea
                  className="min-h-20 rounded-md border border-border bg-surface p-3 text-small"
                  placeholder="Qeyd"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                />
              )}
              <Button variant="primary" disabled={busy} onClick={reject}>
                Rədd etməni təsdiqlə
              </Button>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

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

  function onUpdated(next: ProviderBooking) {
    setBookings((current) => (current ? current.map((row) => (row.id === next.id ? { ...row, ...next } : row)) : current));
  }

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div>
        <h3 className="font-display text-h4 text-text-primary">Rezervasiyalar</h3>
        <p className="mt-1 text-small text-text-secondary">Yeni sorğuları qəbul və ya rədd edin.</p>
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
          <span className="text-2xl" aria-hidden="true">
            📋
          </span>
          <p className="text-body font-medium text-text-primary">Hələ heç bir rezervasiya yoxdur.</p>
          <p className="text-small text-text-muted">Otaqlarınız aktivləşdirildikdən sonra rezervasiyalar burada görünəcək.</p>
        </div>
      )}

      {!loading && bookings !== null && bookings.length > 0 && (
        <ul className="flex flex-col gap-3">
          {bookings.map((booking) => (
            <BookingRow key={booking.id} booking={booking} onUpdated={onUpdated} />
          ))}
        </ul>
      )}
    </Card>
  );
}
