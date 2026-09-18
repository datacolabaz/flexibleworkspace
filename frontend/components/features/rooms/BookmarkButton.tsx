'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/lib/i18n/navigation';
import { IconButton } from '@/components/ui/IconButton';

export interface BookmarkButtonProps {
  roomId: string;
  /** Initial state from the SSR check (`getSessionApiClient()` in the
   * Server Component page) when the visitor is signed in; `null` when
   * signed out — the page never calls the authenticated check for an
   * anonymous visitor. */
  initiallyFavorited: boolean | null;
  /** Called after a successful toggle with the new favorited state — the
   * `/account/favorites` list uses this to remove a card the moment it's
   * unfavorited, since "still showing in my favorites list" would
   * otherwise contradict the heart it just emptied. Optional: the room
   * detail page (this component's original use) has no need to react to
   * the toggle beyond the button's own state. */
  onToggled?: (favorited: boolean) => void;
}

/**
 * "Sevimlilərə əlavə etmə (Bookmark)" — proxies through
 * `/api/favorites/{roomId}` (new this pass) rather than calling the
 * backend directly, since `FavoritesController` requires auth and this is
 * a Client Component (can't read the httpOnly session cookie itself).
 * A signed-out click doesn't silently fail — the BFF route's 401 becomes
 * a sign-in prompt with a return link back to this room.
 */
export function BookmarkButton({ roomId, initiallyFavorited, onToggled }: BookmarkButtonProps) {
  const t = useTranslations('room');
  const pathname = usePathname();
  const [favorited, setFavorited] = useState(initiallyFavorited ?? false);
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [pending, setPending] = useState(false);
  // Room detail (this component's original caller) and FavoriteRoomCard
  // both resolve `initiallyFavorited` before this component ever mounts,
  // so `useState`'s one-time initializer was enough. RoomListingCard
  // (search results) doesn't: `SearchResultsView` fetches `/api/favorites`
  // in the background *after* results — and this button — have already
  // mounted with `initiallyFavorited=false`, so without this sync every
  // already-favorited room in search results would render an empty heart
  // until clicked. This effect applies that late-arriving value once,
  // but never after the visitor's own click — `userToggledRef` stops it
  // from clobbering a toggle made in the narrow window before the
  // background check resolves.
  const userToggledRef = useRef(false);
  useEffect(() => {
    if (!userToggledRef.current && initiallyFavorited !== null && initiallyFavorited !== undefined) {
      setFavorited(initiallyFavorited);
    }
  }, [initiallyFavorited]);

  async function toggle() {
    if (pending) return;
    userToggledRef.current = true;
    setPending(true);
    setNeedsSignIn(false);
    const method = favorited ? 'DELETE' : 'POST';
    try {
      const res = await fetch(`/api/favorites/${roomId}`, { method });
      if (res.status === 401) {
        setNeedsSignIn(true);
        return;
      }
      if (!res.ok) throw new Error(`Favorite toggle failed with status ${res.status}`);
      const data = (await res.json()) as { favorited?: boolean };
      const next = data.favorited ?? !favorited;
      setFavorited(next);
      onToggled?.(next);
    } catch (err) {
      console.error('Failed to toggle favorite:', err);
    } finally {
      setPending(false);
    }
  }

  if (needsSignIn) {
    return (
      <Link
        href={`/login?redirect=${encodeURIComponent(pathname)}`}
        className="text-small font-semibold text-primary underline"
      >
        {t('signInToSave')}
      </Link>
    );
  }

  return (
    <IconButton
      aria-label={favorited ? t('removeFromFavorites') : t('addToFavorites')}
      aria-pressed={favorited}
      onClick={toggle}
      disabled={pending}
    >
      <span aria-hidden="true" className="text-xl leading-none">
        {favorited ? '♥' : '♡'}
      </span>
    </IconButton>
  );
}
