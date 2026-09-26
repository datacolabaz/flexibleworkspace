'use client';

import React, { useEffect, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { usePathname, useRouter } from '@/lib/i18n/navigation';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { RoomListingCard, type RoomSummary } from '@/components/features/rooms/RoomListingCard';
import { RoomListingCardSkeleton } from '@/components/features/rooms/RoomListingCardSkeleton';
import { SearchFilters, draftFromSearchParams } from './SearchFilters';
import { SearchResultsMap } from './SearchResultsMap';
import type { SearchRoomsResult } from '@/lib/api-client/rooms';

const SORT_OPTIONS = ['relevance', 'price', 'distance', 'rating'] as const;

interface MetroStation {
  id: string;
  nameAz: string;
  nameEn: string;
  line?: string;
}

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
  // Desktop map toggle — map hidden by default for performance (Mapbox
  // is not initialised until the user explicitly requests it).
  const [showMap, setShowMap] = useState(false);
  // Which of the *current results* are already favorited by the signed-in
  // visitor — undefined for a signed-out visitor and for anyone before the
  // background check below resolves (RoomListingCard/BookmarkButton treat
  // "not yet known" the same as "not favorited", so there's no loading
  // state of its own to show here).
  const [favoritedRoomIds, setFavoritedRoomIds] = useState<Set<string>>(new Set());
  // Metro stations for the metro filter — loaded once, passed into
  // SearchFilters to avoid SearchFilters making its own parallel fetch
  // (which would change the fetch call order that some tests rely on).
  const [metroStations, setMetroStations] = useState<MetroStation[]>([]);

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

  // Load metro stations once — public endpoint, no auth required.
  // Declared after search/favorites effects so it doesn't shift their
  // call position in tests that check fetch call order.
  useEffect(() => {
    let cancelled = false;
    void fetch('/api/metro-stations', { cache: 'no-store' })
      .then(async (r) => (r.ok ? (await r.json() as unknown) : []))
      .then((data) => {
        if (!cancelled && Array.isArray(data) && data.length > 0) {
          setMetroStations(data as MetroStation[]);
        }
      })
      .catch(() => {
        // Best-effort — metro filter stays hidden when this call fails.
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
    <>
      {/* flex-col below `lg`, flex-row at `lg`+: below `lg` the sidebar is
     // hidden but <SearchFilters>'s mobile trigger button is still a
     // sibling here — in a nowrap row it squeezed the results column down
     // to a sliver (caught live at 390px: the price line pushed ~50px
     // past the viewport edge). Stacking vertically below `lg` gives the
      // trigger button its own full-width row instead. */}
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:flex-row">
      <SearchFilters metroStations={metroStations} />

      <div className="min-w-0 flex-1">
        {/* Results header: title, count, sort dropdown, desktop map toggle */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-h3 font-display text-text-primary">{t('title')}</h1>
            {state.status === 'success' && (
              <p className="whitespace-nowrap text-small text-text-secondary">{t('resultsCount', { count: totalCount })}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Sort dropdown — in header instead of sidebar */}
            <SortControl />
            {/* Desktop-only map toggle */}
            <Button
              variant="secondary"
              size="sm"
              className="hidden lg:inline-flex"
              onClick={() => setShowMap((prev) => !prev)}
              aria-pressed={showMap}
            >
              {showMap ? t('hideMap') : t('showMap')}
            </Button>
          </div>
        </div>

        {/* Active filter chips */}
        <ActiveFilterChips />

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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

          {/* Map — only mounted when needed for performance (Mapbox not
              initialised until the user requests the map). On desktop,
              controlled by showMap; on mobile, controlled by mobileView. */}
          {(showMap || mobileView === 'map') && (
            <div
              className={[
                'sticky top-20 h-[calc(100vh-6rem)] w-full lg:w-[420px]',
                showMap && mobileView === 'map'
                  ? '' // visible on both breakpoints
                  : showMap && mobileView === 'list'
                    ? 'hidden lg:block' // desktop only
                    : 'block lg:hidden', // mobile only
              ].join(' ')}
            >
              <SearchResultsMap
                rooms={results}
                highlightedRoomId={hoveredRoomId}
                onMarkerHover={setHoveredRoomId}
                onMarkerClick={setHoveredRoomId}
                className="h-full w-full"
              />
            </div>
          )}
        </div>
      </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Sort control — lives in the results header, directly mutates the URL
// `sort` param without touching other filter params.
// ---------------------------------------------------------------------------
function SortControl() {
  const t = useTranslations('search');
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const currentSort = searchParams.get('sort') ?? 'relevance';

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const qs = new URLSearchParams(searchParams.toString());
    if (e.target.value === 'relevance') {
      qs.delete('sort');
    } else {
      qs.set('sort', e.target.value);
    }
    // Changing sort resets to page 1.
    qs.delete('page');
    router.replace(qs.size > 0 ? `${pathname}?${qs.toString()}` : pathname);
  }

  const sortLabels: Record<string, string> = {
    relevance: t('sortRelevance'),
    price: t('sortPrice'),
    distance: t('sortDistance'),
    rating: t('sortRating'),
  };

  return (
    <div className="flex items-center gap-1.5">
      <span className="whitespace-nowrap text-small text-text-secondary">{t('sortPrefix')}</span>
      <Select value={currentSort} onChange={handleChange} className="py-1 text-small">
        {SORT_OPTIONS.map((sort) => (
          <option key={sort} value={sort}>
            {sortLabels[sort] ?? sort}
          </option>
        ))}
      </Select>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Active filter chips — shown above the results list when any filter is
// active, one chip per active param with an × to clear just that one.
// ---------------------------------------------------------------------------
function ActiveFilterChips() {
  const t = useTranslations('search');
  const locale = useLocale();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  void locale; // available for future per-locale label formatting

  const draft = draftFromSearchParams(searchParams);

  const chips: { key: string; label: string }[] = [];

  if (draft.city.trim()) chips.push({ key: 'city', label: draft.city.trim() });
  if (draft.roomType) chips.push({ key: 'roomType', label: draft.roomType });
  if (draft.date) chips.push({ key: 'date', label: draft.date });
  if (draft.startTime) chips.push({ key: 'startTime', label: draft.startTime });
  if (draft.durationMinutes) {
    const mins = Number(draft.durationMinutes);
    const label = mins < 60 ? `${mins} dəq` : mins % 60 === 0 ? `${mins / 60} saat` : `${(mins / 60).toFixed(1)} saat`;
    chips.push({ key: 'durationMinutes', label });
  }
  if (draft.participants) chips.push({ key: 'participants', label: `${draft.participants} nəfər` });
  if (draft.priceMax) chips.push({ key: 'priceMax', label: `≤${draft.priceMax} AZN` });
  draft.amenities.forEach((amenity) => {
    // Use the last segment of the translation key as a short label.
    const short = amenity.split('.').pop() ?? amenity;
    chips.push({ key: `amenity:${amenity}`, label: short });
  });

  if (chips.length === 0) return null;

  function clearChip(key: string) {
    const qs = new URLSearchParams(searchParams.toString());
    if (key.startsWith('amenity:')) {
      const amenityKey = key.slice('amenity:'.length);
      const current = qs.get('amenities')?.split(',').filter(Boolean) ?? [];
      const next = current.filter((a) => a !== amenityKey);
      if (next.length > 0) qs.set('amenities', next.join(','));
      else qs.delete('amenities');
    } else {
      qs.delete(key);
    }
    qs.delete('page');
    router.replace(qs.size > 0 ? `${pathname}?${qs.toString()}` : pathname);
  }

  function clearAll() {
    router.replace(pathname);
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2" aria-label={t('activeFilterChips')}>
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={() => clearChip(chip.key)}
          className="flex items-center gap-1 rounded-full border border-border bg-surface px-3 py-1 text-caption font-medium text-text-primary transition-colors hover:border-primary hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
        >
          {chip.label}
          <span aria-hidden="true" className="ml-0.5 text-text-muted">×</span>
        </button>
      ))}
      <button
        type="button"
        onClick={clearAll}
        className="text-caption text-text-secondary underline-offset-2 hover:text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
      >
        {t('clearAllFilters')}
      </button>
    </div>
  );
}
