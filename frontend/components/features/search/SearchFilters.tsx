'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
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

function getCurrentTime(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

function getCurrentDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

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

function formatDateForDisplay(isoDate: string, locale: string): string {
  if (!isoDate) return '';
  const [year, month, day] = isoDate.split('-');
  return locale.startsWith('en') ? `${month}/${day}/${year}` : `${day}.${month}.${year}`;
}

function parseDisplayDate(value: string, locale: string): string | undefined {
  const digits = value.replace(/\D/g, '');
  if (digits.length !== 8) return undefined;
  const isEnglish = locale.startsWith('en');
  const day = isEnglish ? digits.slice(2, 4) : digits.slice(0, 2);
  const month = isEnglish ? digits.slice(0, 2) : digits.slice(2, 4);
  const year = digits.slice(4);
  const candidate = `${year}-${month}-${day}`;
  const date = new Date(`${candidate}T00:00:00`);
  return date.getFullYear() === Number(year) && date.getMonth() + 1 === Number(month) && date.getDate() === Number(day)
    ? candidate
    : undefined;
}

function formatDateTyping(value: string, locale: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  const chunks = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4)];
  return chunks.filter(Boolean).join(locale.startsWith('en') ? '/' : '.');
}

function parseIsoDate(isoDate: string): Date {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function toIsoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function startOfCalendar(date: Date): Date {
  const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
  const mondayBasedDay = (firstDay.getDay() + 6) % 7;
  return new Date(date.getFullYear(), date.getMonth(), 1 - mondayBasedDay);
}

function CalendarPopover({ value, locale, onChange }: { value: string; locale: string; onChange: (date: string) => void }) {
  const today = new Date();
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const selected = value ? parseIsoDate(value) : today;
    return new Date(selected.getFullYear(), selected.getMonth(), 1);
  });
  const selectedDate = value ? parseIsoDate(value) : undefined;
  const calendarStart = startOfCalendar(visibleMonth);
  const days = Array.from({ length: 42 }, (_, index) => {
    const day = new Date(calendarStart);
    day.setDate(calendarStart.getDate() + index);
    return day;
  });
  const weekdayFormatter = new Intl.DateTimeFormat(locale, { weekday: 'short' });
  const monthFormatter = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' });
  const weekdays = Array.from({ length: 7 }, (_, index) => weekdayFormatter.format(new Date(2024, 0, 1 + index)).slice(0, 2));

  return (
    <div className="absolute right-0 top-[calc(100%+0.5rem)] z-30 w-[min(19rem,calc(100vw-2rem))] rounded-lg border border-border bg-surface p-3 shadow-lg" role="dialog" aria-label={locale.startsWith('en') ? 'Choose date' : 'Tarix seçin'}>
      <div className="mb-3 flex items-center justify-between">
        <button type="button" className="rounded-md p-2 text-text-secondary transition-colors hover:bg-surface-elevated hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary" aria-label={locale.startsWith('en') ? 'Previous month' : 'Əvvəlki ay'} onClick={() => setVisibleMonth(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1))}>
          <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4 fill-none stroke-current stroke-2"><path d="m12.5 4-6 6 6 6" /></svg>
        </button>
        <span className="text-sm font-semibold capitalize text-text-primary">{monthFormatter.format(visibleMonth)}</span>
        <button type="button" className="rounded-md p-2 text-text-secondary transition-colors hover:bg-surface-elevated hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary" aria-label={locale.startsWith('en') ? 'Next month' : 'Növbəti ay'} onClick={() => setVisibleMonth(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1))}>
          <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4 fill-none stroke-current stroke-2"><path d="m7.5 4 6 6-6 6" /></svg>
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[0.65rem] font-semibold uppercase text-text-muted">{weekdays.map((weekday, index) => <span key={`${weekday}-${index}`}>{weekday}</span>)}</div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {days.map((day) => {
          const isoDate = toIsoDate(day);
          const isCurrentMonth = day.getMonth() === visibleMonth.getMonth();
          const isSelected = selectedDate && isoDate === toIsoDate(selectedDate);
          const isToday = isoDate === toIsoDate(today);
          return <button key={isoDate} type="button" aria-label={new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(day)} aria-pressed={Boolean(isSelected)} className={`h-9 rounded-md text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${isSelected ? 'bg-primary font-semibold text-white' : isToday ? 'border border-primary font-semibold text-primary' : isCurrentMonth ? 'text-text-primary hover:bg-surface-elevated' : 'text-text-muted/50'}`} onClick={() => onChange(isoDate)}>{day.getDate()}</button>;
        })}
      </div>
      <button type="button" className="mt-3 w-full rounded-md border border-border px-3 py-2 text-xs font-semibold text-primary transition-colors hover:bg-surface-elevated focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary" onClick={() => { onChange(toIsoDate(today)); setVisibleMonth(new Date(today.getFullYear(), today.getMonth(), 1)); }}>
        {locale.startsWith('en') ? 'Today' : 'Bu gün'}
      </button>
    </div>
  );
}

function openNativePicker(input: HTMLInputElement | null): void {
  if (!input) return;
  if (typeof input.showPicker === 'function') input.showPicker();
  else input.click();
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
  const locale = useLocale();
  const [dateText, setDateText] = useState(() => formatDateForDisplay(draft.date || getCurrentDate(), locale));
  const [timeText, setTimeText] = useState(() => draft.startTime || getCurrentTime());
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const timePickerRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDateText(formatDateForDisplay(draft.date || getCurrentDate(), locale));
  }, [draft.date, locale]);

  useEffect(() => {
    setTimeText(draft.startTime || getCurrentTime());
  }, [draft.startTime]);

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

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="filter-date">{t('search.dateLabel')}</Label>
          <div className="relative flex min-h-11 min-w-0 items-center rounded-sm border border-border-strong bg-surface focus-within:border-primary">
            <Input
id="filter-date"
type="text"
inputMode="numeric"
autoComplete="off"
placeholder={locale.startsWith('en') ? 'mm/dd/yyyy' : 'dd.mm.yyyy'}
aria-label={t('search.dateLabel')}
className="min-w-[9.5rem] flex-1 border-0 bg-transparent px-2 text-sm tracking-tight focus:border-0"
value={dateText}
              onChange={(e) => {
                const nextText = formatDateTyping(e.target.value, locale);
                setDateText(nextText);
                const parsed = parseDisplayDate(nextText, locale);
                if (parsed) onChange({ ...draft, date: parsed });
              }}
            />
            <button
              type="button"
              className="mr-1 shrink-0 rounded-md p-2 text-text-secondary transition-colors hover:bg-surface-elevated focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
              aria-label={t('search.chooseDate')}
              aria-expanded={isCalendarOpen}
              onClick={() => setIsCalendarOpen((open) => !open)}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current stroke-2"><rect x="3" y="4.5" width="18" height="16" rx="2" /><path d="M8 3v3M16 3v3M3 9h18M8 13h.01M12 13h.01M16 13h.01M8 17h.01M12 17h.01M16 17h.01" strokeLinecap="round" /></svg>
            </button>
            {isCalendarOpen && (
              <CalendarPopover
                value={draft.date || getCurrentDate()}
                locale={locale}
                onChange={(nextDate) => {
                  setDateText(formatDateForDisplay(nextDate, locale));
                  onChange({ ...draft, date: nextDate });
                  setIsCalendarOpen(false);
                }}
              />
            )}
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="filter-start-time">{t('search.startTimeLabel')}</Label>
          <div className="relative flex min-h-11 items-center rounded-sm border border-border-strong bg-surface">
            <Input
              id="filter-start-time"
              type="text"
              inputMode="numeric"
              placeholder="--:--"
              aria-label={t('search.startTimeLabel')}
              className="min-w-0 flex-1 border-0 bg-transparent pr-1 text-sm focus:border-0"
              value={timeText}
              onChange={(e) => {
                const next = e.target.value.replace(/[^0-9:]/g, '').slice(0, 5);
                setTimeText(next);
                if (/^\d{2}:\d{2}$/.test(next)) onChange({ ...draft, startTime: next });
              }}
            />
            <input
              ref={timePickerRef}
              type="time"
              tabIndex={-1}
              aria-hidden="true"
              className="pointer-events-none absolute h-0 w-0 opacity-0"
              value={draft.startTime || getCurrentTime()}
              onChange={(e) => {
                if (e.target.value) {
                  setTimeText(e.target.value);
                  onChange({ ...draft, startTime: e.target.value });
                }
              }}
            />
            <button
              type="button"
              className="mr-2 rounded-sm px-2 py-1 text-lg leading-none text-text-secondary hover:bg-surface-elevated focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
              aria-label={t('search.chooseTime')}
              onClick={() => openNativePicker(timePickerRef.current)}
            >
              ◷
            </button>
          </div>
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
