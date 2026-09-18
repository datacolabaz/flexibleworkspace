import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { resolveLocaleFromCookie } from '@/lib/i18n/resolve-locale';
import { BookingConfirmingView } from '@/components/features/booking/BookingConfirmingView';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await resolveLocaleFromCookie();
  const t = await getTranslations({ locale, namespace: 'booking.confirming' });
  return { title: t('title') };
}

/**
 * `/booking/{bookingId}/confirming` — exactly what
 * `payments.successUrlTemplate` (13_PAYMENT_ARCHITECTURE.md §13.3)
 * redirects every payer to; see `app/booking/layout.tsx` and
 * `lib/i18n/resolve-locale.ts` for why this lives outside `[locale]`. All
 * the actual logic — polling, status branching — lives in the Client
 * Component, since the redirect itself carries no authoritative status
 * (only the webhook does).
 */
export default async function BookingConfirmingPage({
  params,
}: {
  params: Promise<{ bookingId: string }>;
}) {
  const { bookingId } = await params;
  return (
    <main className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-md flex-col justify-center gap-6 px-4 py-12">
      <BookingConfirmingView bookingId={bookingId} />
    </main>
  );
}
