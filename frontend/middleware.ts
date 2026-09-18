import createMiddleware from 'next-intl/middleware';
import { routing } from './lib/i18n/routing';

export default createMiddleware(routing);

export const config = {
  // Applies to every customer-facing route (locale-prefixed, per
  // 06_INFORMATION_ARCHITECTURE.md). /provider, /admin, and /api are
  // explicitly excluded — they are NOT locale-prefixed (§6.2/§6.3).
  // /booking is excluded for the same reason: its exact path shape
  // (`/booking/{bookingId}/confirming|failed`) is dictated by the
  // backend's own `payments.successUrlTemplate`/`errorUrlTemplate`
  // config (13_PAYMENT_ARCHITECTURE.md §13.3) and must not gain a locale
  // prefix — this middleware would otherwise 307-redirect a payment
  // provider's hosted-checkout callback to `/{locale}/booking/...`,
  // which no route matches (found while building the payment-
  // confirmation page; see lib/i18n/resolve-locale.ts for how this
  // branch still localizes itself, via a cookie instead of the URL).
  matcher: ['/((?!api|provider|admin|booking|_next|_vercel|.*\\..*).*)'],
};
