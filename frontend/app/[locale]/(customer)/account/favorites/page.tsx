import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Alert } from '@/components/ui/Alert';
import { readSession } from '@/lib/auth/session';
import { listFavorites } from '@/lib/api-client/favorites';
import { FavoritesList } from '@/components/features/account/FavoritesList';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'account.favorites' });
  return { title: t('pageTitle') };
}

/**
 * `/account/favorites` — 06_INFORMATION_ARCHITECTURE.md §6.1, the
 * already-shipped `FavoritesController`'s list endpoint
 * (`GET /favorites/me`), SSR via the BFF cookie same as `/account/bookings`.
 * Removal (unfavoriting a card) is handled client-side in
 * `FavoritesList`/`FavoriteRoomCard` — this page only needs the initial
 * fetch.
 */
export default async function AccountFavoritesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('account.favorites');

  const { accessToken } = readSession(await cookies());
  let favorites: Awaited<ReturnType<typeof listFavorites>> = [];
  let loadError = false;
  if (accessToken) {
    try {
      favorites = await listFavorites(accessToken);
    } catch {
      loadError = true;
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-h3 text-text-primary">{t('pageTitle')}</h1>
      {loadError ? <Alert variant="error">{t('loadErrorMessage')}</Alert> : <FavoritesList initialFavorites={favorites} />}
    </div>
  );
}
