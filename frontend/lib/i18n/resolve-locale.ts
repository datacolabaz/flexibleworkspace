import 'server-only';
import { cookies } from 'next/headers';
import { routing } from './routing';

/**
 * Locale resolution for the one branch of the app that sits outside the
 * `/{locale}/*` tree: `/booking/{bookingId}/{confirming,failed}`
 * (`app/booking/`), whose exact, non-locale-prefixed paths are dictated by
 * the backend's own `payments.successUrlTemplate`/`errorUrlTemplate`
 * config (`{CORS_ORIGIN}/booking/{bookingId}/confirming`,
 * PHASE4_REPORT.md's booking-flow section) — there is no `[locale]` route
 * param here for `getTranslations`/`getMessages` to pick up automatically,
 * the way every other page in the app gets it.
 *
 * Falls back to reading the `NEXT_LOCALE` cookie next-intl's own
 * middleware already sets on every locale-prefixed page visit (its
 * default `localeCookie` behavior, `receiveLocaleCookie` in
 * next-intl/routing) — by the time a visitor reaches this page they have
 * always already been on a `/{locale}/...` page (the booking form redirect
 * chain starts there), so the cookie is present in the overwhelming
 * majority of real visits. A missing/invalid cookie (a bookmarked link
 * opened cold, cookies blocked) falls back to `routing.defaultLocale`
 * rather than failing to render.
 */
export async function resolveLocaleFromCookie(): Promise<string> {
  const store = await cookies();
  const cookieLocale = store.get('NEXT_LOCALE')?.value;
  return cookieLocale && (routing.locales as readonly string[]).includes(cookieLocale)
    ? cookieLocale
    : routing.defaultLocale;
}
