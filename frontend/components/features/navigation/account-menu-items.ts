/**
 * Shared account-dropdown destinations for desktop (`AccountMenu`) and
 * the hamburger (`MobileMenu`). Role is `getMyProvider` success, not
 * "has a session cookie": `undefined` means we don't know yet (API
 * error / still resolving) so exclusive provider vs onboarding links
 * stay hidden rather than flashing the wrong set.
 *
 * Customer bookings stay on `/account/bookings`. Provider analytics and
 * payouts are in-page anchors on `/provider`, not new routes.
 */
export type ProviderNavState = boolean | undefined;

export type AccountMenuItem = {
  href: string;
  labelKey:
    | 'menuMyAccount'
    | 'menuMyBookings'
    | 'menuMyEvents'
    | 'menuMyRsvps'
    | 'menuMyFavorites'
    | 'menuBecomeProvider'
    | 'menuProviderDashboard'
    | 'menuProviderAnalytics'
    | 'menuProviderPayouts'
    | 'menuMySpaces';
  /** Locale-prefixed customer routes use next-intl `Link`; `/provider` does not. */
  localePrefixed: boolean;
};

const CUSTOMER_ITEMS: AccountMenuItem[] = [
  { href: '/account/profile', labelKey: 'menuMyAccount', localePrefixed: true },
  { href: '/account/bookings', labelKey: 'menuMyBookings', localePrefixed: true },
  { href: '/account/events', labelKey: 'menuMyEvents', localePrefixed: true },
  { href: '/account/tickets', labelKey: 'menuMyRsvps', localePrefixed: true },
  { href: '/account/favorites', labelKey: 'menuMyFavorites', localePrefixed: true },
];

const PROVIDER_ITEMS: AccountMenuItem[] = [
  { href: '/provider', labelKey: 'menuProviderDashboard', localePrefixed: false },
  { href: '/provider#provider-analytics', labelKey: 'menuProviderAnalytics', localePrefixed: false },
  { href: '/provider#provider-payouts', labelKey: 'menuProviderPayouts', localePrefixed: false },
  { href: '/provider#provider-rooms', labelKey: 'menuMySpaces', localePrefixed: false },
];

const BECOME_PROVIDER_ITEM: AccountMenuItem = {
  href: '/list-your-space',
  labelKey: 'menuBecomeProvider',
  localePrefixed: true,
};

export function getAccountMenuItems(isProvider: ProviderNavState): AccountMenuItem[] {
  if (isProvider === true) {
    return [...PROVIDER_ITEMS, ...CUSTOMER_ITEMS];
  }
  if (isProvider === false) {
    return [...CUSTOMER_ITEMS, BECOME_PROVIDER_ITEM];
  }
  return CUSTOMER_ITEMS;
}
