'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/lib/i18n/navigation';
import { Alert } from '@/components/ui/Alert';
import { Spinner } from '@/components/ui/Spinner';
import { Card } from '@/components/ui/Card';
import { formatMoney } from '@/lib/format/money';
import type { BookingSummary } from '@/lib/api-client/bookings';

export interface BookingConfirmingViewProps {
  bookingId: string;
}

type ViewState =
  | { kind: 'polling'; slow: boolean }
  | { kind: 'confirmed'; booking: BookingSummary }
  | { kind: 'notCompleted'; booking: BookingSummary }
  | { kind: 'notFound' }
  | { kind: 'error' };

const POLL_INTERVAL_MS = 3000;
const SLOW_AFTER_MS = 20000;
const TERMINAL_NOT_CONFIRMED = new Set(['CANCELLED', 'EXPIRED', 'NO_SHOW', 'REFUND_PENDING', 'REFUNDED']);
const CONFIRMED_LIKE = new Set(['CONFIRMED', 'COMPLETED']);

/**
 * The redirect target `payments.successUrlTemplate` sends every payer
 * (guest or authenticated) to — but the redirect itself is never
 * authoritative, only the provider webhook is
 * (13_PAYMENT_ARCHITECTURE.md §13.3 steps 4-5, `PaymentsService.handleWebhook`'s
 * own doc comment). At the moment this page loads, the webhook may not
 * have arrived yet even for a genuinely successful payment (dev-mode
 * checkout in particular redirects here immediately, with no webhook
 * fired until something calls it), so this polls
 * `GET /bookings/{bookingId}` — the same endpoint the `bookings.controller.ts`
 * guest-access fix exists for — rather than trusting anything in the URL.
 */
export function BookingConfirmingView({ bookingId }: BookingConfirmingViewProps) {
  const t = useTranslations('booking.confirming');
  const locale = useLocale();
  const [state, setState] = useState<ViewState>({ kind: 'polling', slow: false });
  const startedAtRef = useRef(Date.now());

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function poll() {
      try {
        const res = await fetch(`/api/bookings/${bookingId}`, { cache: 'no-store' });
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
        if (CONFIRMED_LIKE.has(booking.status ?? '')) {
          setState({ kind: 'confirmed', booking });
          return;
        }
        if (TERMINAL_NOT_CONFIRMED.has(booking.status ?? '')) {
          setState({ kind: 'notCompleted', booking });
          return;
        }

        // Still PENDING/PAYMENT_PENDING — the webhook hasn't landed yet.
        const slow = Date.now() - startedAtRef.current > SLOW_AFTER_MS;
        setState({ kind: 'polling', slow });
        timer = setTimeout(poll, POLL_INTERVAL_MS);
      } catch {
        if (!cancelled) setState({ kind: 'error' });
      }
    }

    poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [bookingId]);

  if (state.kind === 'polling') {
    return (
      <Card className="flex flex-col items-center gap-4 text-center">
        <Spinner className="h-8 w-8" />
        <div>
          <h1 className="font-display text-h3 text-text-primary">{t('title')}</h1>
          <p className="mt-2 text-body text-text-secondary">
            {state.slow ? t('stillProcessingMessage') : t('waitingMessage')}
          </p>
        </div>
      </Card>
    );
  }

  if (state.kind === 'confirmed') {
    const { booking } = state;
    const item = booking.items?.[0];
    return (
      <Card className="flex flex-col gap-4">
        <div className="text-center">
          <span aria-hidden="true" className="text-4xl">✓</span>
          <h1 className="mt-2 font-display text-h3 text-text-primary">{t('confirmedTitle')}</h1>
          <p className="mt-1 text-body text-text-secondary">{t('confirmedMessage')}</p>
        </div>
        <dl className="flex flex-col gap-2 rounded-md border border-border bg-surface-elevated p-4 text-small">
          {item?.startAt && item?.endAt && (
            <div className="flex justify-between">
              <dt className="text-text-secondary">{t('whenLabel')}</dt>
              <dd className="font-semibold text-text-primary">
                {new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.startAt))}
              </dd>
            </div>
          )}
          {booking.totalAmount !== undefined && booking.currency && (
            <div className="flex justify-between">
              <dt className="text-text-secondary">{t('totalLabel')}</dt>
              <dd className="font-semibold text-text-primary">{formatMoney(booking.totalAmount, booking.currency, locale)}</dd>
            </div>
          )}
        </dl>
        <Link
          href="/"
          locale={locale}
          className="inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-5 text-label font-semibold text-accent-on transition-colors hover:bg-accent-hover"
        >
          {t('backHomeCta')}
        </Link>
      </Card>
    );
  }

  if (state.kind === 'notCompleted') {
    return (
      <Card className="flex flex-col gap-4 text-center">
        <h1 className="font-display text-h3 text-text-primary">{t('cancelledTitle')}</h1>
        <p className="text-body text-text-secondary">{t('cancelledMessage')}</p>
        <Link href="/" locale={locale} className="text-primary underline underline-offset-2 hover:no-underline">
          {t('backHomeCta')}
        </Link>
      </Card>
    );
  }

  if (state.kind === 'notFound') {
    return (
      <Card className="flex flex-col gap-4 text-center">
        <Alert variant="error">{t('notFoundMessage')}</Alert>
        <Link href="/" locale={locale} className="text-primary underline underline-offset-2 hover:no-underline">
          {t('backHomeCta')}
        </Link>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-4 text-center">
      <Alert variant="error">{t('genericErrorMessage')}</Alert>
      <Link href="/" locale={locale} className="text-primary underline underline-offset-2 hover:no-underline">
        {t('backHomeCta')}
      </Link>
    </Card>
  );
}
