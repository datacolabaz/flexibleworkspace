'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/lib/i18n/navigation';
import { FavoriteRoomCard } from './FavoriteRoomCard';
import type { FavoriteRoomSummary } from '@/lib/api-client/favorites';

export interface FavoritesListProps {
  initialFavorites: FavoriteRoomSummary[];
}

/**
 * Owns the favorites array as client state, seeded from the SSR fetch in
 * `/account/favorites/page.tsx` — a Client Component boundary is needed
 * here (not just inside each card) because unfavoriting has to remove
 * the card from the *list*, and only a shared parent can do that; each
 * `FavoriteRoomCard` only knows about itself. Also owns the empty state,
 * since removing the last favorite has to flip into it without a page
 * reload.
 */
export function FavoritesList({ initialFavorites }: FavoritesListProps) {
  const t = useTranslations('account.favorites');
  const [favorites, setFavorites] = useState(initialFavorites);

  function handleRemoved(roomId: string | undefined) {
    setFavorites((prev) => prev.filter((room) => room.id !== roomId));
  }

  if (favorites.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-12 text-center">
        <p className="text-label font-semibold text-text-primary">{t('emptyTitle')}</p>
        <p className="text-small text-text-secondary">{t('emptyMessage')}</p>
        <Link href="/search" className="mt-2 text-small font-semibold text-primary underline underline-offset-2">
          {t('emptyCta')}
        </Link>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {favorites.map((room) => (
        <FavoriteRoomCard key={room.id} room={room} onRemoved={() => handleRemoved(room.id)} />
      ))}
    </div>
  );
}
