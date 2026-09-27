'use client';

import { useLocale, useTranslations } from 'next-intl';
import { usePathname, useRouter } from '@/lib/i18n/navigation';
import { LOCALE_LABELS, LOCALE_SHORT_LABELS, SWITCHABLE_LOCALES } from '@/lib/i18n/routing';
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
  const selectedFullName =
    LOCALE_LABELS[selected as (typeof SWITCHABLE_LOCALES)[number]] ?? LOCALE_LABELS.az;

  function handleChange(event: React.ChangeEvent<HTMLSelectElement>) {
    router.replace(pathname, { locale: event.target.value });
  }

  return (
    <div className="shrink-0">
      <label htmlFor="language-switcher" className="sr-only">
        {t('language')}
      </label>
      {/* Short codes (AZ / EN / RU). Compact fixed width so the control
       * does not crowd "Tədbir yarat"; overflow-visible + no truncate so
       * labels are not clipped to "A". */}
      <Select
        id="language-switcher"
        value={selected}
        onChange={handleChange}
        aria-label={`${t('language')}: ${selectedFullName}`}
        className="w-[4.25rem] min-w-[4.25rem] max-w-[4.25rem] overflow-visible whitespace-nowrap !px-1.5 !pr-6 !text-sm"
      >
        {SWITCHABLE_LOCALES.map((loc) => (
          <option key={loc} value={loc} aria-label={LOCALE_LABELS[loc]} title={LOCALE_LABELS[loc]}>
            {LOCALE_SHORT_LABELS[loc]}
          </option>
        ))}
      </Select>
    </div>
  );
}
