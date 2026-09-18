import type { AbstractIntlMessages } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing';

/**
 * Deep-merges a locale's messages onto the English base so a missing key
 * in a deferred locale (tr/es/de — 20_I18N.md §20.7) resolves to its
 * English string instead of a raw key or blank text, without needing
 * every deferred-locale file to duplicate every key up front.
 */
function deepMerge(base: Record<string, unknown>, override: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base };
  for (const key of Object.keys(override)) {
    const baseVal = base[key];
    const overrideVal = override[key];
    if (
      baseVal && overrideVal &&
      typeof baseVal === 'object' && typeof overrideVal === 'object' &&
      !Array.isArray(baseVal) && !Array.isArray(overrideVal)
    ) {
      result[key] = deepMerge(baseVal as Record<string, unknown>, overrideVal as Record<string, unknown>);
    } else {
      result[key] = overrideVal;
    }
  }
  return result;
}

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = requested && (routing.locales as readonly string[]).includes(requested)
    ? requested
    : routing.defaultLocale;

  const english = (await import(`../../messages/en.json`)).default as AbstractIntlMessages;
  const localeMessages = locale === 'en'
    ? english
    : ((await import(`../../messages/${locale}.json`)).default as AbstractIntlMessages);

  const messages: AbstractIntlMessages = locale === 'en'
    ? english
    : (deepMerge(english, localeMessages) as AbstractIntlMessages);

  return { locale, messages };
});
