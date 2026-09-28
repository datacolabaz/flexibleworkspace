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
    <div className="relative shrink-0">
      <label htmlFor="language-switcher" className="sr-only">
        {t('language')}
      </label>
      {/* Short codes (AZ / EN / RU). Compact fixed width so the control
       * does not crowd "Tədbir yarat"; overflow-visible + no truncate so
       * labels are not clipped to "A".
       *
       * `appearance-none` + the hand-drawn chevron below (rather than the
       * browser's native one): at this width the native select-arrow
       * rendering path visibly DISTORTS the option text next to it in
       * Chrome — "RU" was rendering with a flattened, L-like second
       * letter (confirmed live: switching to appearance:none on the exact
       * same element fixed it immediately, independent of font/size/
       * padding — those were all already fine on their own). Losing the
       * native arrow this way is why a custom one is drawn back in.
       *
       * `text-center` + a smaller `pr` (bug report, 2026-09-27): the
       * select's own left/right padding used to be very asymmetric
       * (6px/24px, to clear the old, wider chevron) with left-aligned
       * text, which visibly crammed "AZ"/"EN"/"RU" against the box's left
       * edge. Centering the text and trimming how much room the chevron
       * reserves moves the label much closer to the middle of the visible
       * box (the chevron itself still anchors the right edge, same as any
       * other select). */}
      <Select
        id="language-switcher"
        value={selected}
        onChange={handleChange}
        aria-label={`${t('language')}: ${selectedFullName}`}
        className="w-[4.25rem] min-w-[4.25rem] max-w-[4.25rem] appearance-none overflow-visible whitespace-nowrap text-center !pl-2 !pr-[1.15rem] !text-sm"
      >
        {SWITCHABLE_LOCALES.map((loc) => (
          <option key={loc} value={loc} aria-label={LOCALE_LABELS[loc]} title={LOCALE_LABELS[loc]}>
            {LOCALE_SHORT_LABELS[loc]}
          </option>
        ))}
      </Select>
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        fill="none"
        className="pointer-events-none absolute right-1 top-1/2 h-3 w-3 -translate-y-1/2 text-text-secondary"
      >
        <path d="M5 7.5 10 12.5 15 7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
