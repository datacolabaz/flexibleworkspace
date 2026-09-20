'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/lib/i18n/navigation';
import { ROOM_TYPES } from '@/lib/constants/taxonomy';

interface HomeSearchDraft {
  roomType: string;
  city: string;
  date: string;
  participants: string;
}

const INITIAL_DRAFT: HomeSearchDraft = {
  roomType: '',
  city: 'Bakı',
  date: '',
  participants: '',
};

/**
 * Intent-first entry point for the marketplace. Unlike the previous single
 * free-text field, this form captures the four decisions that materially
 * change availability: purpose, city, date and group size. It still hands
 * off to the existing /search contract, so this is a progressive UX upgrade
 * rather than a parallel search implementation.
 */
export function HomeSearchForm() {
  const t = useTranslations();
  const router = useRouter();
  const [draft, setDraft] = useState<HomeSearchDraft>(INITIAL_DRAFT);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = new URLSearchParams();
    if (draft.roomType) query.set('roomType', draft.roomType);
    if (draft.city.trim()) query.set('city', draft.city.trim());
    if (draft.date) query.set('date', draft.date);
    if (draft.participants) query.set('participants', draft.participants);
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
          value={draft.roomType}
          onChange={(event) => setDraft((current) => ({ ...current, roomType: event.target.value }))}
          className="min-h-7 w-full bg-transparent text-small text-text-primary outline-none"
        >
          <option value="">{t('home.search.purposeAny')}</option>
          {ROOM_TYPES.filter((type) => type.parentKey === null).map((type) => (
            <option key={type.key} value={type.translationKey}>
              {t(`taxonomy.roomType.${type.key}`)}
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
