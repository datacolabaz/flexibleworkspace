'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/lib/i18n/navigation';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import type { BookingSummary } from '@/lib/api-client/bookings';

export interface BookingFailedViewProps {
  bookingId: string;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'payable'; roomId?: string }
  | { kind: 'expired'; roomId?: string }
  | { kind: 'notFound' }
  | { kind: 'error' };

const PAYABLE_STATUSES = new Set(['PENDING', 'PAYMENT_PENDING']);

/**
 * `payments.errorUrlTemplate`'s redirect target — reached when the hosted
 * checkout itself reports a failed/cancelled attempt, before any webhook
 * (13_PAYMENT_ARCHITECTURE.md §13.3). This is NOT the same as a confirmed
 * failure: `BookingsService`'s `holdMinutes` config means the booking's
 * hold may still be live, so this checks the booking's actual current
 * status (same `GET /bookings/{bookingId}` the confirming page polls)
 * rather than assuming the booking is dead, and offers a same-booking
 * payment retry (`POST /payments` again, no new `POST /bookings`) when
 * it's still payable.
 */
export function BookingFailedView({ bookingId }: BookingFailedViewProps) {
  const t = useTranslations('booking.failed');
  const locale = useLocale();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | undefined>();

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/bookings/${bookingId}`, { cache: 'no-store' })
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 404) {
          setState({ kind: 'notFound' });
          return;
        }
        if (!res.ok) {
          setState({ kind: 'error' });
          return;
        }
        const booking = (await res.json()) as BookingSummary;
        const roomId = booking.items?.[0]?.roomId;
        if (PAYABLE_STATUSES.has(booking.status ?? '')) {
          setState({ kind: 'payable', roomId });
        } else {
          setState({ kind: 'expired', roomId });
        }
      })
      .catch(() => {
        if (!cancelled) setState({ kind: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [bookingId]);

  async function retryPayment() {
    setIsRetrying(true);
    setRetryError(undefined);
    try {
      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId, provider: 'EPOINT' }),
      });
      if (!res.ok) {
        setRetryError(t('retryErrorMessage'));
        setIsRetrying(false);
        return;
      }
      const session = (await res.json()) as { checkoutUrl?: string };
      if (session.checkoutUrl) {
        window.location.assign(session.checkoutUrl);
      } else {
        setRetryError(t('retryErrorMessage'));
        setIsRetrying(false);
      }
    } catch {
      setRetryError(t('retryErrorMessage'));
      setIsRetrying(false);
    }
  }

  if (state.kind === 'loading') {
    return (
      <Card className="flex flex-col items-center gap-3 text-center">
        <Spinner className="h-6 w-6" />
      </Card>
    );
  }

  const homeLink = (
    <Link href="/" locale={locale} className="text-primary underline underline-offset-2 hover:no-underline">
      {t('backHomeCta')}
    </Link>
  );

  if (state.kind === 'notFound') {
    return (
      <Card className="flex flex-col gap-4 text-center">
        <Alert variant="error">{t('notFoundMessage')}</Alert>
        {homeLink}
      </Card>
    );
  }

  if (state.kind === 'error') {
    return (
      <Card className="flex flex-col gap-4 text-center">
        <Alert variant="error">{t('genericErrorMessage')}</Alert>
        {homeLink}
      </Card>
    );
  }

  if (state.kind === 'expired') {
    return (
      <Card className="flex flex-col gap-4 text-center">
        <h1 className="font-display text-h3 text-text-primary">{t('expiredTitle')}</h1>
        <p className="text-body text-text-secondary">{t('expiredMessage')}</p>
        {state.roomId ? (
          <Link
            href={`/rooms/${state.roomId}`}
            locale={locale}
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-5 text-label font-semibold text-accent-on transition-colors hover:bg-accent-hover"
          >
            {t('backToRoomCta')}
          </Link>
        ) : (
          homeLink
        )}
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-4 text-center">
      <h1 className="font-display text-h3 text-text-primary">{t('title')}</h1>
      <p className="text-body text-text-secondary">{t('message')}</p>
      {retryError && <Alert variant="error">{retryError}</Alert>}
      <Button variant="primary" fullWidth isLoading={isRetrying} onClick={retryPayment}>
        {isRetrying ? t('retryingCta') : t('retryCta')}
      </Button>
      {homeLink}
    </Card>
  );
}
