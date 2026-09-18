'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/lib/i18n/navigation';

/** The homepage hero's search box — was a non-functional placeholder
 * (`app/[locale]/(customer)/page.tsx`'s own comment: "proves the
 * scaffold ... not the final design"). Wires it to the real `/search`
 * page built this pass, as a simple city query — the full filter set
 * lives on the results page itself. */
export function HomeSearchForm() {
  const t = useTranslations('hero');
  const router = useRouter();
  const [city, setCity] = useState('');

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = city.trim();
    router.push(trimmed ? `/search?city=${encodeURIComponent(trimmed)}` : '/search');
  }

  return (
    <form className="flex w-full max-w-md gap-2" role="search" onSubmit={handleSubmit}>
      <input
        type="search"
        value={city}
        onChange={(e) => setCity(e.target.value)}
        placeholder={t('searchPlaceholder')}
        aria-label={t('searchPlaceholder')}
        className="flex-1 rounded-md border border-border bg-surface px-4 py-3 text-body text-text-primary placeholder:text-text-muted focus:border-border-strong focus:outline-none"
      />
      <button
        type="submit"
        className="rounded-md bg-accent px-5 py-3 text-label font-semibold text-accent-on hover:bg-accent-hover"
      >
        {t('searchButton')}
      </button>
    </form>
  );
}
