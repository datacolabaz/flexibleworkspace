'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { usePathname, useRouter } from '@/lib/i18n/navigation';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Select } from '@/components/ui/Select';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { ROOM_TYPES, AMENITIES, AMENITY_CATEGORIES } from '@/lib/constants/taxonomy';

const DURATION_OPTIONS = [30, 60, 90, 120, 180, 240, 360, 480] as const;
const SORT_OPTIONS = ['relevance', 'price', 'distance', 'rating'] as const;

interface FilterDraft {
  city: string;
  roomType: string;
  date: string;
  startTime: string;
  durationMinutes: string;
  participants: string;
  priceMax: string;
  amenities: string[];
  sort: string;
}

const EMPTY_DRAFT: FilterDraft = {
  city: '',
  roomType: '',
  date: '',
  startTime: '',
  durationMinutes: '',
  participants: '',
  priceMax: '',
  amenities: [],
  sort: 'relevance',
};

function draftFromSearchParams(params: URLSearchParams): FilterDraft {
  return {
    city: params.get('city') ?? '',
    roomType: params.get('roomType') ?? '',
    date: params.get('date') ?? '',
    startTime: params.get('startTime') ?? '',
    durationMinutes: params.get('durationMinutes') ?? '',
    participants: params.get('participants') ?? '',
    // priceMax travels through the URL/API in minor units (qəpik); the
    // input itself shows whole currency units, so it's converted at the
    // read/write boundary here rather than carried as minor units through
    // form state.
    priceMax: params.get('priceMax') ? String(Math.round(Number(params.get('priceMax')) / 100)) : '',
    amenities: params.get('amenities')?.split(',').filter(Boolean) ?? [],
    sort: params.get('sort') ?? 'relevance',
  };
}

function draftToQueryString(draft: FilterDraft): string {
  const qs = new URLSearchParams();
  if (draft.city.trim()) qs.set('city', draft.city.trim());
  if (draft.roomType) qs.set('roomType', draft.roomType);
  if (draft.date) qs.set('date', draft.date);
  if (draft.startTime) qs.set('startTime', draft.startTime);
  if (draft.durationMinutes) qs.set('durationMinutes', draft.durationMinutes);
  if (draft.participants) qs.set('participants', draft.participants);
  if (draft.priceMax) qs.set('priceMax', String(Math.round(Number(draft.priceMax) * 100)));
  if (draft.amenities.length > 0) qs.set('amenities', draft.amenities.join(','));
  if (draft.sort && draft.sort !== 'relevance') qs.set('sort', draft.sort);
  // Filter changes are a new search — always land back on page 1.
  return qs.toString();
}

function countActive(draft: FilterDraft): number {
  let count = 0;
  if (draft.city.trim()) count += 1;
  if (draft.roomType) count += 1;
  if (draft.date) count += 1;
  if (draft.startTime) count += 1;
  if (draft.durationMinutes) count += 1;
  if (draft.participants) count += 1;
  if (draft.priceMax) count += 1;
  count += draft.amenities.length;
  return count;
}

function FilterFields({ draft, onChange }: { draft: FilterDraft; onChange: (next: FilterDraft) => void }) {
  const t = useTranslations();

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="filter-city">{t('search.cityLabel')}</Label>
        <Input
          id="filter-city"
          type="text"
          placeholder={t('search.cityPlaceholder')}
          value={draft.city}
          onChange={(e) => onChange({ ...draft, city: e.target.value })}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="filter-room-type">{t('search.roomTypeLabel')}</Label>
        <Select
          id="filter-room-type"
          value={draft.roomType}
          onChange={(e) => onChange({ ...draft, roomType: e.target.value })}
        >
          <option value="">{t('search.roomTypeAny')}</option>
          {ROOM_TYPES.filter((rt) => rt.parentKey === null).map((rt) => (
            <optgroup key={rt.key} label={t(`taxonomy.roomType.${rt.key}`)}>
              <option value={rt.translationKey}>{t(`taxonomy.roomType.${rt.key}`)}</option>
              {ROOM_TYPES.filter((sub) => sub.parentKey === rt.key).map((sub) => (
                <option key={sub.key} value={sub.translationKey}>
                  {'— '}
                  {t(`taxonomy.roomType.${sub.key}`)}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="filter-date">{t('search.dateLabel')}</Label>
          <Input
            id="filter-date"
            type="date"
            value={draft.date}
            onChange={(e) => onChange({ ...draft, date: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="filter-start-time">{t('search.startTimeLabel')}</Label>
          <Input
            id="filter-start-time"
            type="time"
            value={draft.startTime}
            onChange={(e) => onChange({ ...draft, startTime: e.target.value })}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="filter-duration">{t('search.durationLabel')}</Label>
        <Select
          id="filter-duration"
          value={draft.durationMinutes}
          onChange={(e) => onChange({ ...draft, durationMinutes: e.target.value })}
        >
          <option value="">{t('search.durationAny')}</option>
          {DURATION_OPTIONS.map((minutes) => (
            <option key={minutes} value={minutes}>
              {t(`search.duration${minutes}`)}
            </option>
          ))}
        </Select>
      </div>

      <div className="grid grid-cols-1 gap-3">
        <div className="rounded-md border border-border bg-surface-elevated p-3 transition-colors focus-within:border-primary focus-within:bg-surface">
          <Label htmlFor="filter-participants">{t('search.participantsLabel')}</Label>
          <div className="mt-2 flex min-h-11 items-center rounded-sm border border-border-strong bg-surface">
            <Input
              id="filter-participants"
              type="number"
              min={1}
              inputMode="numeric"
              placeholder="məs. 4"
              className="min-h-0 flex-1 border-0 bg-transparent px-3 focus:border-0 focus-visible:outline-none"
              value={draft.participants}
              onChange={(e) => onChange({ ...draft, participants: e.target.value })}
            />
            <span className="mr-2 shrink-0 rounded-sm bg-oil-50 px-2 py-1 text-caption font-semibold text-primary" aria-hidden="true">
              {t('search.participantsUnit')}
            </span>
          </div>
        </div>
        <div className="rounded-md border border-border bg-surface-elevated p-3 transition-colors focus-within:border-primary focus-within:bg-surface">
          <Label htmlFor="filter-price-max">{t('search.priceMaxLabel')}</Label>
          <div className="mt-2 flex min-h-11 items-center rounded-sm border border-border-strong bg-surface">
            <Input
              id="filter-price-max"
              type="number"
              min={0}
              inputMode="numeric"
              placeholder="məs. 50"
              className="min-h-0 flex-1 border-0 bg-transparent px-3 focus:border-0 focus-visible:outline-none"
              value={draft.priceMax}
              onChange={(e) => onChange({ ...draft, priceMax: e.target.value })}
            />
            <span className="mr-2 shrink-0 rounded-sm bg-oil-50 px-2 py-1 text-caption font-semibold text-primary" aria-hidden="true">
              {t('search.priceMaxUnit')}
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="filter-sort">{t('search.sortLabel')}</Label>
        <Select id="filter-sort" value={draft.sort} onChange={(e) => onChange({ ...draft, sort: e.target.value })}>
          {SORT_OPTIONS.map((sort) => (
            <option key={sort} value={sort}>
              {t(`search.sort${sort.charAt(0).toUpperCase()}${sort.slice(1)}`)}
            </option>
          ))}
        </Select>
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-label text-text-primary">{t('search.amenitiesLabel')}</legend>
        {AMENITY_CATEGORIES.map((category) => (
          <div key={category} className="flex flex-col gap-2">
            <p className="text-caption font-semibold uppercase tracking-wide text-text-muted">
              {t(`search.amenityCategory.${category}`)}
            </p>
            <div className="flex flex-col gap-1">
              {AMENITIES.filter((a) => a.category === category).map((amenity) => {
                const checked = draft.amenities.includes(amenity.translationKey);
                return (
                  <label
                    key={amenity.key}
                    className="flex min-h-11 items-center gap-2 text-body text-text-primary"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      className="h-4 w-4 rounded-sm border-border-strong text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                      onChange={(e) =>
                        onChange({
                          ...draft,
                          amenities: e.target.checked
                            ? [...draft.amenities, amenity.translationKey]
                            : draft.amenities.filter((key) => key !== amenity.translationKey),
                        })
                      }
                    />
                    {t(`taxonomy.amenity.${amenity.key}`)}
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </fieldset>
    </div>
  );
}

/**
 * Filters sync to the URL query string (shareable/bookmarkable search
 * results, and "applied state preserved when reopened" — 08_DESIGN_
 * SYSTEM.md §8.2 — falls out for free since the sheet always reseeds its
 * draft from the current URL rather than its own persisted state). A
 * local "draft" absorbs keystrokes; nothing hits the network or the URL
 * until Apply, so typing in the city field doesn't refetch per character.
 *
 * Desktop (§8.6): persistent sidebar, always visible, own Apply button.
 * Mobile: a Filters button (badge = active count) opens the shared
 * <BottomSheet> primitive with the same fields and its own Apply/Clear.
 */
export function SearchFilters() {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const currentDraft = draftFromSearchParams(searchParams);
  const [desktopDraft, setDesktopDraft] = useState<FilterDraft>(currentDraft);
  const [mobileDraft, setMobileDraft] = useState<FilterDraft>(currentDraft);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Reseed both drafts whenever the URL changes from elsewhere (Clear,
  // back/forward navigation, a shared link) so the form never shows
  // stale values next to an already-changed result set.
  const serializedParams = searchParams.toString();
  useEffect(() => {
    const next = draftFromSearchParams(new URLSearchParams(serializedParams));
    setDesktopDraft(next);
    setMobileDraft(next);
  }, [serializedParams]);

  function apply(draft: FilterDraft) {
    const qs = draftToQueryString(draft);
    router.replace(qs ? `${pathname}?${qs}` : pathname);
    setMobileOpen(false);
  }

  function clear() {
    setDesktopDraft(EMPTY_DRAFT);
    setMobileDraft(EMPTY_DRAFT);
    router.replace(pathname);
    setMobileOpen(false);
  }

  const activeCount = countActive(currentDraft);

  return (
    <>
      {/* Desktop: persistent sidebar (08_DESIGN_SYSTEM.md §8.6's Filters row). */}
      <aside className="hidden w-72 shrink-0 lg:block">
        <div className="sticky top-20 rounded-lg border border-border bg-surface p-4 shadow-sm">
          <h2 className="mb-4 text-h4 font-display text-text-primary">{t('search.filtersTitle')}</h2>
          <FilterFields draft={desktopDraft} onChange={setDesktopDraft} />
          <div className="mt-5 flex gap-2">
            <Button variant="primary" fullWidth onClick={() => apply(desktopDraft)}>
              {t('search.applyButton')}
            </Button>
            <Button variant="secondary" onClick={clear}>
              {t('search.clearButton')}
            </Button>
          </div>
        </div>
      </aside>

      {/* Mobile: a Filters button opening the shared bottom sheet. */}
      <div className="lg:hidden">
        <Button variant="secondary" onClick={() => setMobileOpen(true)} className="relative">
          {t('search.filterButton')}
          {/* The literal space keeps the accessible name "Filters 3"
           * rather than a concatenated "Filters3" for screen readers. */}
          {activeCount > 0 && ' '}
          {activeCount > 0 && (
            <span className="ml-1 inline-flex min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-caption font-semibold text-accent-on">
              {activeCount}
            </span>
          )}
        </Button>

        <BottomSheet open={mobileOpen} onClose={() => setMobileOpen(false)} title={t('search.filtersTitle')} closeLabel={t('nav.closeMenu')}>
          <FilterFields draft={mobileDraft} onChange={setMobileDraft} />
          <div className="mt-5 flex gap-2 pb-2">
            <Button variant="primary" fullWidth onClick={() => apply(mobileDraft)}>
              {t('search.applyButton')}
            </Button>
            <Button variant="secondary" onClick={clear}>
              {t('search.clearButton')}
            </Button>
          </div>
        </BottomSheet>
      </div>
    </>
  );
}

// Re-exported for the results view, which needs the same page-1-reset
// query string when a sort control outside the filter panel changes.
export { draftFromSearchParams, draftToQueryString };
export type { FilterDraft };
