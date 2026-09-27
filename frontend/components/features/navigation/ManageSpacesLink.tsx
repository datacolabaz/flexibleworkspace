'use client';

import NextLink from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * "Məkan idarəsi" — the provider-only desktop nav link to /provider (which
 * lives at app/provider, outside app/[locale], so it's never locale-
 * prefixed — plain next/navigation usePathname, not lib/i18n/navigation's
 * wrapper, matches it correctly).
 *
 * Bug report (2026-09-27): this was unconditionally accent-colored, so it
 * stayed orange no matter which page was actually open — with every other
 * nav item plain-until-hovered, that reads as a stuck/active state, and
 * doubly so next to "Ana səhifə" carrying a real focus/active highlight of
 * its own on the home page. Now it only takes the accent treatment while
 * an actual /provider route is open; everywhere else it matches the rest
 * of the row (same idle/hover styling as navItems in Header.tsx).
 */
export function ManageSpacesLink({ label }: { label: string }) {
  const pathname = usePathname();
  const active = pathname === '/provider' || pathname.startsWith('/provider/');

  return (
    <NextLink
      href="/provider"
      aria-current={active ? 'page' : undefined}
      className={[
        'group relative inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-md px-1.5 text-nav transition-[color,background-color,transform] duration-150 hover:-translate-y-px hover:bg-surface-elevated after:absolute after:bottom-1 after:left-1.5 after:right-1.5 after:h-px after:origin-left after:bg-accent after:transition-transform after:duration-200',
        active
          ? 'font-semibold text-accent after:scale-x-100'
          : 'text-text-secondary hover:text-accent after:scale-x-0 hover:after:scale-x-100',
      ].join(' ')}
    >
      {label}
    </NextLink>
  );
}
