'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { usePathname, useRouter } from '@/lib/i18n/navigation';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { RoomListingCard, type RoomSummary } from '@/components/features/rooms/RoomListingCard';
import { RoomListingCardSkeleton } from '@/components/features/rooms/RoomListingCardSkeleton';
import { SearchFilters } from './SearchFilters';
import { SearchResultsMap } from './SearchResultsMap';
import type { SearchRoomsResult } from '@/lib/api-client/rooms';

type MobileView = 'list' | 'map';

interface FetchState {
  status: 'loading' | 'success' | 'error';
  data?: SearchRoomsResult;
}

/**
 * Client-rendered search results (FRONTEND_IMPLEMENTATION_PLAN.md §7 —
 * search results are explicitly allowed to be client-rendered, unlike
 * room detail/provider pages which need SSR for SEO). Fetches through
 * the BFF's `/api/search` route (never `BACKEND_API_URL` directly —
 * `lib/api-client/rooms.ts` is `server-only`).
 *
 * Layout per 08_DESIGN_SYSTEM.md §8.6: `lg:` and up is the synced
 * list+map split view (filters sidebar, scrollable list, sticky map);
 * below `lg` is a single column with a List/Map toggle, since a phone
 * screen can't usefully show both.
 */
export function SearchResultsView() {
  const t = useTranslations('search');
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [state, setState] = useState<FetchState>({ status: 'loading' });
  const [hoveredRoomId, setHoveredRoomId] = useState<string | undefined>(undefined);
  const [mobileView, setMobileView] = useState<MobileView>('list');
  // Which of the *current results* are already favorited by the signed-in
  // visitor — undefined for a signed-out visitor and for anyone before the
  // background check below resolves (RoomListingCard/BookmarkButton treat
  // "not yet known" the same as "not favorited", so there's no loading
  // state of its own to show here).
  const [favoritedRoomIds, setFavoritedRoomIds] = useState<Set<string>>(new Set());

  const queryString = searchParams.toString();

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });

    fetch(`/api/search${queryString ? `?${queryString}` : ''}`, { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Search request failed with status ${res.status}`);
        return (await res.json()) as SearchRoomsResult;
      })
      .then((data) => {
        if (!cancelled) setState({ status: 'success', data });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error' });
      });

    return () => {
      cancelled = true;
    };
  }, [queryString]);

  // Fetched once, independent of the search query — `GET /spaces` has no
  // `favorited` field (confirmed against `search.service.ts`'s `mapRow()`
  // and the OpenAPI `RoomSummary` schema), so which cards should render a
  // filled heart on first paint is a separate cross-reference against
  // `/api/favorites` (a thin proxy to `GET /favorites/me`), not a
  // per-card or per-search-request check. A signed-out visitor gets back
  // an empty list (see `app/api/favorites/route.ts`), which renders
  // identically to "signed in, nothing favorited yet" — no error state
  // needed either way, this is a best-effort enrichment of the results
  // that are already showing.
  useEffect(() => {
    let cancelled = false;

    fetch('/api/favorites', { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Failed to load favorites with status ${res.status}`);
        return (await res.json()) as { roomIds: string[] };
      })
      .then((data) => {
        if (!cancelled) setFavoritedRoomIds(new Set(data.roomIds));
      })
      .catch(() => {
        // Best-effort only — cards simply start unfavorited and self-
        // correct the moment the visitor toggles one, same as before this
        // check existed.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const results: RoomSummary[] = state.data?.results ?? [];
  const page = state.data?.page ?? 1;
  const pageSize = state.data?.pageSize ?? 20;
  const totalCount = state.data?.totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  function goToPage(nextPage: number) {
    const qs = new URLSearchParams(queryString);
    qs.set('page', String(nextPage));
    router.replace(`${pathname}?${qs.toString()}`);
  }

  function retry() {
    // Re-triggers the effect above without changing the URL.
    setState({ status: 'loading' });
    const qs = queryString;
    fetch(`/api/search${qs ? `?${qs}` : ''}`, { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Search request failed with status ${res.status}`);
        return (await res.json()) as SearchRoomsResult;
      })
      .then((data) => setState({ status: 'success', data }))
      .catch(() => setState({ status: 'error' }));
  }

  return (
    // flex-col below `lg`, flex-row at `lg`+: below `lg` the sidebar is
    // hidden but <SearchFilters>'s mobile trigger button is still a
    // sibling here — in a nowrap row it squeezed the results column down
    // to a sliver (caught live at 390px: the price line pushed ~50px
    // past the viewport edge). Stacking vertically below `lg` gives the
    // trigger button its own full-width row instead.
    <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:flex-row">
      <SearchFilters />

      <div className="min-w-0 flex-1">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h1 className="text-h3 font-display text-text-primary">{t('title')}</h1>
          {state.status === 'success' && (
            <p className="whitespace-nowrap text-small text-text-secondary">{t('resultsCount', { count: totalCount })}</p>
          )}
        </div>

        {/* Mobile List/Map toggle — 08_DESIGN_SYSTEM.md §8.6: "List/Map
         * toggle" is the mobile binding for the desktop split view. */}
        <div className="mb-4 flex gap-2 lg:hidden" role="tablist" aria-label={t('title')}>
          <Button
            variant={mobileView === 'list' ? 'primary' : 'secondary'}
            size="sm"
            role="tab"
            aria-selected={mobileView === 'list'}
            onClick={() => setMobileView('list')}
          >
            {t('listViewToggle')}
          </Button>
          <Button
            variant={mobileView === 'map' ? 'primary' : 'secondary'}
            size="sm"
            role="tab"
            aria-selected={mobileView === 'map'}
            onClick={() => setMobileView('map')}
          >
            {t('mapViewToggle')}
          </Button>
        </div>

        <div className="flex gap-6">
          <div className={['min-w-0 flex-1 lg:!block', mobileView === 'map' ? 'hidden' : 'block'].join(' ')}>
            {state.status === 'loading' && (
              <div className="flex flex-col gap-3">
                {Array.from({ length: 6 }).map((_, index) => (
                  <RoomListingCardSkeleton key={index} />
                ))}
              </div>
            )}

            {state.status === 'error' && (
              <Alert variant="error">
                <div className="flex items-center justify-between gap-3">
                  <span>{t('errorTitle')}</span>
                  <Button variant="secondary" size="sm" onClick={retry}>
                    {t('errorRetry')}
                  </Button>
                </div>
              </Alert>
            )}

            {state.status === 'success' && results.length === 0 && (
              <div className="rounded-lg border border-border bg-surface p-8 text-center">
                <p className="text-body font-semibold text-text-primary">{t('noResults')}</p>
                <p className="mt-1 text-small text-text-secondary">{t('noResultsHint')}</p>
              </div>
            )}

            {state.status === 'success' && results.length > 0 && (
              <>
                <div className="flex flex-col gap-3">
                  {results.map((room) => (
                    <RoomListingCard
                      key={room.id}
                      room={room}
                      highlighted={room.id !== undefined && room.id === hoveredRoomId}
                      onHoverChange={setHoveredRoomId}
                      initiallyFavorited={room.id !== undefined ? favoritedRoomIds.has(room.id) : false}
                    />
                  ))}
                </div>

                {totalPages > 1 && (
                  <nav className="mt-6 flex items-center justify-center gap-3" aria-label={t('title')}>
                    <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => goToPage(page - 1)}>
                      {t('prevPage')}
                    </Button>
                    <span className="text-small text-text-secondary">{t('pageLabel', { page, totalPages })}</span>
                    <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => goToPage(page + 1)}>
                      {t('nextPage')}
                    </Button>
                  </nav>
                )}
              </>
            )}
          </div>

          <div className={['sticky top-20 h-[calc(100vh-6rem)] w-full lg:block lg:w-[420px]', mobileView === 'list' ? 'hidden' : 'block'].join(' ')}>
            <SearchResultsMap
              rooms={results}
              highlightedRoomId={hoveredRoomId}
              onMarkerHover={setHoveredRoomId}
              onMarkerClick={setHoveredRoomId}
              className="h-full w-full"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
