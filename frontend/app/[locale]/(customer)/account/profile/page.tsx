import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Alert } from '@/components/ui/Alert';
import { readSession } from '@/lib/auth/session';
import { getMyProfile } from '@/lib/api-client/account';
import { ProfileForm } from '@/components/features/account/ProfileForm';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'account.profile' });
  return { title: t('pageTitle') };
}

/**
 * `/account/profile` — 06_INFORMATION_ARCHITECTURE.md §6.1, the third
 * `/account/*` sub-page (after bookings/favorites). Same SSR pattern as
 * `/account/bookings`: the parent layout already redirected an
 * unauthenticated visitor to `/login`, so the access-token cookie is
 * expected to be present — the `loadError` branch below only covers the
 * narrow window where a token expires between the layout's check and this
 * page's render, not the common case.
 */
export default async function AccountProfilePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('account.profile');

  const { accessToken } = readSession(await cookies());
  let profile: Awaited<ReturnType<typeof getMyProfile>> | undefined;
  let loadError = false;
  if (accessToken) {
    try {
      profile = await getMyProfile(accessToken);
    } catch {
      loadError = true;
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-h3 text-text-primary">{t('pageTitle')}</h1>

      {(loadError || !profile) && <Alert variant="error">{t('loadErrorMessage')}</Alert>}

      {!loadError && profile && <ProfileForm initialProfile={profile} />}
    </div>
  );
}
