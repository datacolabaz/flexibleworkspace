import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { resolveLocaleFromCookie } from '@/lib/i18n/resolve-locale';
import { BookingFailedView } from '@/components/features/booking/BookingFailedView';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await resolveLocaleFromCookie();
  const t = await getTranslations({ locale, namespace: 'booking.failed' });
  return { title: t('title') };
}

/**
 * `/booking/{bookingId}/failed` — `payments.errorUrlTemplate`'s redirect
 * target (13_PAYMENT_ARCHITECTURE.md §13.3). See the confirming page's
 * sibling comment and `app/booking/layout.tsx` for why this route sits
 * outside `[locale]`.
 */
export default async function BookingFailedPage({
  params,
}: {
  params: Promise<{ bookingId: string }>;
}) {
  const { bookingId } = await params;
  return (
    <main className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-md flex-col justify-center gap-6 px-4 py-12">
      <BookingFailedView bookingId={bookingId} />
    </main>
  );
}
