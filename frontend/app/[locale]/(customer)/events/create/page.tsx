import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from '@/lib/i18n/navigation';
import { readSession } from '@/lib/auth/session';
import { EventCreateWizard } from '@/components/features/events/EventCreateWizard';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'eventCreate' });
  return { title: t('metaTitle') };
}

/**
 * Multi-step event creation page (/events/create).
 * Auth wall — redirect to /login if not authenticated.
 * The wizard itself is a Client Component (EventCreateWizard) so it can
 * manage step state without re-rendering the full page.
 */
export default async function EventCreatePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const store = await cookies();
  const { accessToken } = readSession(store);
  if (!accessToken) {
    redirect({
      href: `/login?redirect=${encodeURIComponent('/events/create')}`,
      locale,
    });
  }

  const t = await getTranslations({ locale, namespace: 'eventCreate' });

  return (
    <main id="main-content" className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <h1 className="mb-8 font-display text-h1 text-text-primary">{t('pageTitle')}</h1>
      <EventCreateWizard />
    </main>
  );
}
