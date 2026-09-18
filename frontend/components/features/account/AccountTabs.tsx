'use client';

import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/lib/i18n/navigation';

const TABS = [
  { href: '/account/bookings', labelKey: 'bookingsTabLabel' } as const,
  { href: '/account/favorites', labelKey: 'favoritesTabLabel' } as const,
  { href: '/account/reviews', labelKey: 'reviewsTabLabel' } as const,
  { href: '/account/payment-history', labelKey: 'paymentHistoryTabLabel' } as const,
  { href: '/account/profile', labelKey: 'profileTabLabel' } as const,
];

/**
 * The `/account/*` sub-nav — all five `06_INFORMATION_ARCHITECTURE.md`
 * §6.1 sub-pages (bookings/favorites/reviews/payment-history/profile). A
 * Client Component only for `usePathname()` (to highlight the active
 * tab) — the tabs themselves are plain `Link`s, so the pages they lead
 * to stay Server Components.
 *
 * `overflow-x-auto` + `whitespace-nowrap` on the row: five tabs
 * (including "Payment history," the longest label) don't reliably fit
 * one line at the 375/390px mandated breakpoints, so the row scrolls
 * horizontally within itself rather than overflowing the page —
 * 08_DESIGN_SYSTEM.md §8.6's "no horizontal page scroll" bar, same
 * "its own `overflow-x: auto` container" pattern this app already uses
 * for wide tables/code blocks elsewhere.
 */
export function AccountTabs() {
  const t = useTranslations('account');
  const pathname = usePathname();

  return (
    <nav aria-label={t('tabsNavLabel')} className="flex gap-1 overflow-x-auto border-b border-border">
      {TABS.map((tab) => {
        const active = pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={[
              'min-h-11 shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-label font-semibold transition-colors',
              active
                ? 'border-primary text-text-primary'
                : 'border-transparent text-text-secondary hover:text-text-primary',
            ].join(' ')}
          >
            {t(tab.labelKey)}
          </Link>
        );
      })}
    </nav>
  );
}
