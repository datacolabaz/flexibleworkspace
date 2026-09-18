import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from '@/lib/i18n/navigation';
import { readSession } from '@/lib/auth/session';
import { ListYourSpaceForm } from '@/components/features/business/ListYourSpaceForm';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'listYourSpace' });
  return { title: t('pageTitle') };
}

/**
 * `/list-your-space` — `06_INFORMATION_ARCHITECTURE.md` §6.1's "Provider
 * signup entry point," the `/for-businesses` landing page's CTA target
 * (this pass's Phase 4 item 3). `POST /providers` (`ProvidersController
 * .create`) is a real, complete, already-shipped self-service endpoint —
 * any signed-in user can register, starting `verificationStatus:
 * PENDING` — so this reuses it rather than inventing a lead-capture stub
 * or a fake "contact us" form.
 *
 * A hard auth wall, same reasoning as `/account/*`'s own layout: the
 * backend endpoint requires a session (a `Provider` needs a real
 * `owner_user_id`), so there's no anonymous version of this page to
 * show — redirect to `/login?redirect=/list-your-space` up front rather
 * than let someone fill out the form only to 401 on submit.
 */
export default async function ListYourSpacePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('listYourSpace');

  const { accessToken } = readSession(await cookies());
  if (!accessToken) {
    redirect({ href: `/login?redirect=${encodeURIComponent('/list-your-space')}`, locale });
  }

  return (
    <main id="main-content" className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <h1 className="font-display text-h2 text-text-primary">{t('pageTitle')}</h1>
      <p className="mt-3 text-body text-text-secondary">{t('pageIntro')}</p>
      <div className="mt-8">
        <ListYourSpaceForm />
      </div>
    </main>
  );
}
