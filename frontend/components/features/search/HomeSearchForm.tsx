'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/lib/i18n/navigation';
import { track, AnalyticsEvent } from '@/lib/analytics/track';
import {
  SEARCH_ACTIVITIES,
  buildSpaceSearchQuery,
  mapActivityToCategory,
} from '@/lib/search/activity-category';

interface HomeSearchDraft {
  activity: string;
  city: string;
  date: string;
  participants: string;
}

const INITIAL_DRAFT: HomeSearchDraft = {
  activity: '',
  city: 'Bakı',
  date: '',
  participants: '',
};

/**
 * Intent-first entry point for the marketplace. Purpose maps onto the
 * existing /search contract via marketplace `category` (BFF converts that
 * to GET /spaces `roomType`). No parallel search mode.
 */
export function HomeSearchForm() {
  const t = useTranslations();
  const router = useRouter();
  const [draft, setDraft] = useState<HomeSearchDraft>(INITIAL_DRAFT);

  function handleActivityChange(activity: string) {
    setDraft((current) => ({ ...current, activity }));
    if (!activity) return;
    track(AnalyticsEvent.PurposeSelected, {
      activity,
      mapped_category: mapActivityToCategory(activity) ?? null,
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = buildSpaceSearchQuery({
      activity: draft.activity,
      city: draft.city,
      date: draft.date,
      participants: draft.participants,
    });
    const mappedCategory = mapActivityToCategory(draft.activity) ?? null;
    track(AnalyticsEvent.PurposeSearchSubmitted, {
      activity: draft.activity || null,
      mapped_category: mappedCategory,
      participants: draft.participants || null,
      metroStationId: null,
    });
    router.push(query.size > 0 ? `/search?${query.toString()}` : '/search');
  }

  return (
    <form
      className="grid w-full grid-cols-1 gap-2 rounded-lg border border-border bg-surface p-2 shadow-md sm:grid-cols-2 lg:grid-cols-[1.25fr_1fr_1fr_0.7fr_auto]"
      role="search"
      aria-label={t('home.search.ariaLabel')}
      onSubmit={handleSubmit}
    >
      <label className="flex min-w-0 flex-col gap-1 rounded-md px-3 py-2 focus-within:bg-surface-elevated">
        <span className="text-caption font-semibold text-text-secondary">{t('home.search.purposeLabel')}</span>
        <select
          value={draft.activity}
          onChange={(event) => handleActivityChange(event.target.value)}
          className="min-h-7 w-full bg-transparent text-small text-text-primary outline-none"
        >
          <option value="">{t('home.search.purposeAny')}</option>
          {SEARCH_ACTIVITIES.map((activity) => (
            <option key={activity} value={activity}>
              {t(`home.search.activities.${activity}`)}
            </option>
          ))}
        </select>
      </label>

      <label className="flex min-w-0 flex-col gap-1 rounded-md border-t border-border px-3 py-2 focus-within:bg-surface-elevated sm:border-l sm:border-t-0">
        <span className="text-caption font-semibold text-text-secondary">{t('home.search.cityLabel')}</span>
        <input
          type="text"
          value={draft.city}
          onChange={(event) => setDraft((current) => ({ ...current, city: event.target.value }))}
          placeholder={t('home.search.cityPlaceholder')}
          className="min-h-7 w-full bg-transparent text-small text-text-primary outline-none placeholder:text-text-muted"
        />
      </label>

      <label className="flex min-w-0 flex-col gap-1 rounded-md border-t border-border px-3 py-2 focus-within:bg-surface-elevated lg:border-l lg:border-t-0">
        <span className="text-caption font-semibold text-text-secondary">{t('home.search.dateLabel')}</span>
        <input
          type="date"
          value={draft.date}
          onChange={(event) => setDraft((current) => ({ ...current, date: event.target.value }))}
          className="min-h-7 w-full bg-transparent text-small text-text-primary outline-none"
        />
      </label>

      <label className="flex min-w-0 flex-col gap-1 rounded-md border-t border-border px-3 py-2 focus-within:bg-surface-elevated sm:border-l lg:border-t-0">
        <span className="text-caption font-semibold text-text-secondary">{t('home.search.guestsLabel')}</span>
        <input
          type="number"
          min={1}
          inputMode="numeric"
          value={draft.participants}
          onChange={(event) => setDraft((current) => ({ ...current, participants: event.target.value }))}
          placeholder={t('home.search.guestsPlaceholder')}
          className="min-h-7 w-full bg-transparent text-small text-text-primary outline-none placeholder:text-text-muted"
        />
      </label>

      <button
        type="submit"
        className="min-h-12 rounded-md bg-accent px-6 text-label font-semibold text-accent-on hover:bg-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:bg-accent-active active:text-accent-active-on"
      >
        {t('home.search.submit')}
      </button>
    </form>
  );
}
