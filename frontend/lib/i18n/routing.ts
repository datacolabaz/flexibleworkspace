import { defineRouting } from 'next-intl/routing';

/**
 * Routing still accepts all six locale prefixes so an old `/tr`/`/es`/`/de`
 * URL does not 404. The language switcher only lists az/en/ru; hidden
 * prefixes redirect to `az` in middleware.
 */
export const routing = defineRouting({
  locales: ['az', 'en', 'ru', 'tr', 'es', 'de'],
  defaultLocale: 'az',
});

export type AppLocale = (typeof routing.locales)[number];

export const SWITCHABLE_LOCALES = ['az', 'en', 'ru'] as const satisfies readonly AppLocale[];
export const HIDDEN_LOCALES = ['tr', 'es', 'de'] as const satisfies readonly AppLocale[];

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

/** Navbar language control only — full names stay on `LOCALE_LABELS` (profile, aria). */
export const LOCALE_SHORT_LABELS: Record<(typeof SWITCHABLE_LOCALES)[number], string> = {
  az: 'Az',
  en: 'En',
  ru: 'Ru',
};
