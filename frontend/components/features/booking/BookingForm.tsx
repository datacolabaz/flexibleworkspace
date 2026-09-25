'use client';

import { useState, type FormEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/lib/i18n/navigation';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { FormField, fieldDescribedBy } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { formatMoney } from '@/lib/format/money';

export interface BookingFormProps {
  roomId: string;
  startAt: string;
  endAt: string;
  pricePerHour: { amount?: number; currency?: string } | null;
  isAuthenticated: boolean;
  capacityMin?: number;
  capacityMax?: number;
}

interface BffErrorBody {
  error?: { code?: string };
}
type BookingMode = 'REQUEST_BASED' | 'PAYMENT_BASED';
type CreatedBooking = { id: string; mode?: BookingMode };

/**
 * Only the machine-readable `code` is read off the error envelope — the
 * backend's own `message` is English-only prose (11_API_CONTRACTS.md
 * §11.2), never shown directly; localization happens client-side
 * (20_I18N.md §20.5), matching `LoginForm`'s `readErrorCode` convention.
 */
async function readErrorCode(response: Response): Promise<string | undefined> {
  try {
    const body = (await response.json()) as BffErrorBody;
    return body.error?.code;
  } catch {
    return undefined;
  }
}

/**
 * `POST /bookings` chooses the flow from the backend response: REQUEST_BASED
 * ends after creating a PENDING request, while PAYMENT_BASED continues with
 * `POST /payments` and a hosted checkout redirect. No payment-provider picker:
 * EPOINT is the documented V1 primary
 * provider (13_PAYMENT_ARCHITECTURE.md §13.4) and which gateway processes
 * a card isn't a decision a customer needs to make — PAYRIFF exists only
 * as the backend's own secondary/backup adapter.
 *
 * If booking creation succeeds but the payment-session call fails (network
 * blip, provider hiccup), the booking already exists — retrying must NOT
 * call `POST /bookings` again (a second hold isn't wanted, and the first
 * hold is still live for `holdMinutes`), so the created booking's id is
 * kept in state and "Try payment again" only re-calls `/api/payments`.
 */
export function BookingForm({
  roomId,
  startAt,
  endAt,
  pricePerHour,
  isAuthenticated,
  capacityMin,
  capacityMax,
}: BookingFormProps) {
  const t = useTranslations('booking');
  const locale = useLocale();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [participants, setParticipants] = useState<number | ''>(capacityMin ?? '');
  const [purpose, setPurpose] = useState('');

  const [contactError, setContactError] = useState<string | undefined>();
  const [banner, setBanner] = useState<{ variant: 'error'; message: string } | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdBookingId, setCreatedBookingId] = useState<string | null>(null);
  const [requestSubmitted, setRequestSubmitted] = useState(false);

  const durationMinutes = Math.round((new Date(endAt).getTime() - new Date(startAt).getTime()) / 60_000);
  const subtotal =
    pricePerHour?.amount !== undefined ? Math.round((pricePerHour.amount * durationMinutes) / 60) : null;

  function errorMessageFor(code: string | undefined): string {
    switch (code) {
      case 'SLOT_UNAVAILABLE':
        return t('errors.slotUnavailable');
      case 'ROOM_NOT_ACTIVE':
        return t('errors.roomNotActive');
      case 'CUSTOMER_REQUIRED':
        return t('errors.contactRequired');
      case 'INVALID_RANGE':
        return t('errors.invalidRange');
      default:
        return t('errors.generic');
    }
  }

  async function submitPayment(bookingId: string) {
    const res = await fetch('/api/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookingId, provider: 'EPOINT' }),
    });
    if (!res.ok) {
      const code = await readErrorCode(res);
      setBanner({ variant: 'error', message: errorMessageFor(code) });
      return;
    }
    const session = (await res.json()) as { checkoutUrl?: string };
    if (session.checkoutUrl) {
      window.location.assign(session.checkoutUrl);
    } else {
      setBanner({ variant: 'error', message: t('errors.generic') });
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBanner(undefined);
    setContactError(undefined);

    if (createdBookingId) {
      // A booking already exists from a previous attempt — only the
      // payment step failed, so only retry that.
      setIsSubmitting(true);
      try {
        await submitPayment(createdBookingId);
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    if (!isAuthenticated && !email.trim() && !phone.trim()) {
      setContactError(t('errors.contactRequired'));
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId,
          startAt,
          endAt,
          participants: participants === '' ? undefined : participants,
          purpose: purpose.trim() || undefined,
          ...(isAuthenticated
            ? {}
            : {
                customer: {
                  name: name.trim() || undefined,
                  email: email.trim() || undefined,
                  phone: phone.trim() || undefined,
                },
              }),
        }),
      });

      if (!res.ok) {
        const code = await readErrorCode(res);
        if (code === 'CUSTOMER_REQUIRED') {
          setContactError(errorMessageFor(code));
        } else {
          setBanner({ variant: 'error', message: errorMessageFor(code) });
        }
        return;
      }

      const booking = (await res.json()) as CreatedBooking;
      setCreatedBookingId(booking.id);
      if (booking.mode === 'REQUEST_BASED') {
        setRequestSubmitted(true);
        return;
      }
      await submitPayment(booking.id);
    } catch {
      setBanner({ variant: 'error', message: t('errors.generic') });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5 rounded-lg border border-border bg-surface p-4 sm:p-6">
      <h2 className="font-display text-h4 text-text-primary">{t('pageTitle')}</h2>

      {banner && (
        <Alert variant={banner.variant}>
          {banner.message}{' '}
          {!createdBookingId && (
            <Link href={`/rooms/${roomId}`} className="underline underline-offset-2">
              {t('backToRoom')}
            </Link>
          )}
        </Alert>
      )}
      {requestSubmitted && <Alert variant="success">{t('requestSubmitted')}</Alert>}

      {!isAuthenticated && !createdBookingId && (
        <div className="flex flex-col gap-4">
          <div>
            <p className="text-small font-semibold text-text-primary">{t('guestSectionTitle')}</p>
            <p className="text-small text-text-secondary">{t('guestSectionHint')}</p>
          </div>

          <FormField id="booking-name" label={t('nameLabel')}>
            <Input
              id="booking-name"
              name="name"
              type="text"
              autoComplete="name"
              value={name}
              disabled={isSubmitting}
              onChange={(event) => setName(event.target.value)}
              placeholder={t('namePlaceholder')}
            />
          </FormField>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField
              id="booking-email"
              label={t('emailLabel')}
              error={contactError}
              className="sm:col-span-1"
            >
              <Input
                id="booking-email"
                name="email"
                type="email"
                autoComplete="email"
                inputMode="email"
                value={email}
                disabled={isSubmitting}
                invalid={Boolean(contactError)}
                aria-describedby={fieldDescribedBy('booking-email', { error: contactError })}
                onChange={(event) => setEmail(event.target.value)}
                placeholder={t('emailPlaceholder')}
              />
            </FormField>

            <FormField id="booking-phone" label={t('phoneLabel')} className="sm:col-span-1">
              <Input
                id="booking-phone"
                name="phone"
                type="tel"
                autoComplete="tel"
                inputMode="tel"
                value={phone}
                disabled={isSubmitting}
                invalid={Boolean(contactError)}
                onChange={(event) => setPhone(event.target.value)}
                placeholder={t('phonePlaceholder')}
              />
            </FormField>
          </div>

          <p className="text-small text-text-secondary">
            {t('haveAnAccount')}{' '}
            <Link href="/login" className="text-primary underline underline-offset-2 hover:no-underline">
              {t('signInLink')}
            </Link>
          </p>
        </div>
      )}

      {!createdBookingId && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField id="booking-participants" label={t('participantsLabel')}>
            <Input
              id="booking-participants"
              name="participants"
              type="number"
              min={capacityMin ?? 1}
              max={capacityMax}
              value={participants}
              disabled={isSubmitting}
              onChange={(event) => setParticipants(event.target.value === '' ? '' : Number(event.target.value))}
            />
          </FormField>

          <FormField id="booking-purpose" label={t('purposeLabel')}>
            <Input
              id="booking-purpose"
              name="purpose"
              type="text"
              value={purpose}
              disabled={isSubmitting}
              onChange={(event) => setPurpose(event.target.value)}
              placeholder={t('purposePlaceholder')}
            />
          </FormField>
        </div>
      )}

      {subtotal !== null && pricePerHour?.currency && (
        <div className="flex flex-col gap-1 border-t border-border pt-4 text-small">
          <div className="flex items-center justify-between text-text-secondary">
            <span>{t('priceSubtotal')}</span>
            <span className="font-semibold text-text-primary">
              {formatMoney(subtotal, pricePerHour.currency, locale)}
            </span>
          </div>
        </div>
      )}

      {!requestSubmitted && <div>
        <Label className="sr-only" htmlFor="booking-submit">
          {t('submitCta')}
        </Label>
        <Button id="booking-submit" type="submit" variant="primary" fullWidth isLoading={isSubmitting}>
          {isSubmitting ? t('submittingCta') : createdBookingId ? t('retryPaymentCta') : t('submitCta')}
        </Button>
      </div>}
    </form>
  );
}
