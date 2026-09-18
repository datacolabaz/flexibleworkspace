import { defineRouting } from 'next-intl/routing';

/**
 * All six locales are technically supported and exposed in the header
 * switcher from V1 (20_I18N.md §20.7) — az/en/ru are content-active at
 * launch, tr/es/de are deferred content but still selectable, falling
 * back to English string-by-string rather than being hidden (§20.7).
 * `az` is the default: primary market language (§20.7).
 */
export const routing = defineRouting({
  locales: ['az', 'en', 'ru', 'tr', 'es', 'de'],
  defaultLocale: 'az',
});

export type AppLocale = (typeof routing.locales)[number];

// Each locale's own name for itself, not translated through the message
// catalog — a Russian speaker still expects to see "Русский" in a list
// even when the page around it is in English (standard language-switcher
// convention). Shared by the header's LanguageSwitcher and the account
// profile page's notification-language field — both need the same
// locale-name-in-its-own-script list, and keeping one copy means a future
// seventh locale only needs updating here plus the `locales` array above.
export const LOCALE_LABELS: Record<AppLocale, string> = {
  az: 'Azərbaycanca',
  en: 'English',
  ru: 'Русский',
  tr: 'Türkçe',
  es: 'Español',
  de: 'Deutsch',
};
