'use client';

import { useLocale, useTranslations } from 'next-intl';
import { usePathname, useRouter } from '@/lib/i18n/navigation';
import { routing, LOCALE_LABELS } from '@/lib/i18n/routing';
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

  function handleChange(event: React.ChangeEvent<HTMLSelectElement>) {
    router.replace(pathname, { locale: event.target.value });
  }

  return (
    <div>
      <label htmlFor="language-switcher" className="sr-only">
        {t('language')}
      </label>
      {/* Capped + truncated below `sm` (08_DESIGN_SYSTEM.md §8.6: no
       * horizontal overflow at 390/375px) — the longest label
       * ("Azərbaycanca") otherwise pushes the header wider than a phone
       * viewport before the language switcher even shares space with the
       * theme toggle and hamburger next to it. */}
      <Select
        id="language-switcher"
        value={locale}
        onChange={handleChange}
        className="max-w-[6.5rem] truncate pr-6 sm:max-w-none sm:pr-8"
      >
        {routing.locales.map((loc) => (
          <option key={loc} value={loc}>
            {LOCALE_LABELS[loc]}
          </option>
        ))}
      </Select>
    </div>
  );
}
