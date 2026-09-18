/**
 * `Money.amount` is minor units (qəpik) everywhere in the API — matching
 * `pricePerHour.amount` on `RoomSummary`/`RoomDetail` (29_API_OPENAPI.yaml).
 *
 * Deliberately NOT `Intl.NumberFormat(..., {style: 'currency', ...})`,
 * despite that being the obvious one-liner: the room detail page's
 * server-rendered price hit a real React hydration-mismatch error, found
 * live, on `az` — this app's default locale (20_I18N.md §20.7) — because
 * `style: 'currency'` depends on each JS engine's own ICU currency
 * pattern table, and Node and Chromium disagree for AZN in `az` in two
 * different ways: the default `currencyDisplay: 'symbol'` picks a
 * different glyph/fallback (`"45 ₼"` vs `"AZN 45"`), and even forcing
 * `currencyDisplay: 'code'` still left the code on a different side of
 * the number (`"45 AZN"` vs `"AZN 45"`) — the CLDR currency-pattern
 * placement itself differs by engine, not just the symbol lookup. The
 * search page never hit this because `RoomListingCard` is client-only
 * (no SSR'd price text to mismatch against).
 *
 * The fix sidesteps CLDR currency patterns entirely: `Intl.NumberFormat`
 * is used only for its plain numeric grouping (locale-standard digit
 * grouping is far more stable across ICU implementations than currency
 * symbol/placement tables), and the currency code is appended in a fixed
 * position by hand — deterministic regardless of which engine renders
 * it, server or client.
 */
export function formatMoney(amount: number, currency: string, locale: string): string {
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(amount / 100);
  return `${number} ${currency}`;
}
