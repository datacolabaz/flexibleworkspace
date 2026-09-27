'use client';

import { useLocale, useTranslations } from 'next-intl';
import { usePathname, useRouter } from '@/lib/i18n/navigation';
import { LOCALE_LABELS, SWITCHABLE_LOCALES } from '@/lib/i18n/routing';
import { Select } from '@/components/ui/Select';

/**
 * The header's language switcher (06_INFORMATION_ARCHITECTURE.md §6.5's
 * primary nav). Switches locale in place — `usePathname()` from
 * lib/i18n/navigation returns the locale-*agnostic* path, so passing it
 * back to `router.replace` with a new `locale` keeps whatever page the
 * person is on instead of bouncing them to the homepage.
 */
export function LanguageSwitcher() {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations('nav');
  const selected = (SWITCHABLE_LOCALES as readonly string[]).includes(locale)
    ? locale
    : 'az';

  function handleChange(event: React.ChangeEvent<HTMLSelectElement>) {
    router.replace(pathname, { locale: event.target.value });
  }

  return (
    <div className="shrink-0">
      <label htmlFor="language-switcher" className="sr-only">
        {t('language')}
      </label>
      {/* Always capped so "Azərbaycanca" cannot expand into AccountMenu
       * or signed-in nav CTAs. Truncation stays below `sm` for 390px. */}
      <Select
        id="language-switcher"
        value={selected}
        onChange={handleChange}
        className="max-w-[6.5rem] truncate pr-6 sm:max-w-[8.5rem] sm:pr-8"
      >
        {SWITCHABLE_LOCALES.map((loc) => (
          <option key={loc} value={loc}>
            {LOCALE_LABELS[loc]}
          </option>
        ))}
      </Select>
    </div>
  );
}
