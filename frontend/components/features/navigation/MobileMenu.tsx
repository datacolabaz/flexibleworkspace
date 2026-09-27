'use client';

import { useEffect, useRef, useState } from 'react';
import NextLink from 'next/link';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/lib/i18n/navigation';
import { IconButton } from '@/components/ui/IconButton';
import { getAccountMenuItems, type ProviderNavState } from './account-menu-items';

export interface NavItem {
  href: string;
  label: string;
}

/**
 * The header's compact/hamburger pattern for narrow viewports
 * (08_DESIGN_SYSTEM.md §8.6: "Compact nav (menu/hamburger)" — note that
 * per that same table row, the language switcher and theme toggle are
 * *not* folded in here; Header.tsx keeps both inline at every width so
 * they stay "directly reachable, not buried two levels deep"). Only the
 * primary nav links, login or the role-aware account links, and (when
 * signed in) a logout action collapse into this panel.
 */
export function MobileMenu({
  navItems,
  loginHref,
  loginLabel,
  isAuthenticated,
  isProvider,
}: {
  navItems: NavItem[];
  loginHref: string;
  loginLabel: string;
  isAuthenticated: boolean;
  isProvider?: ProviderNavState;
}) {
  const t = useTranslations('nav');
  const tAccount = useTranslations('account');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const firstLinkRef = useRef<HTMLAnchorElement>(null);
  const accountItems = isAuthenticated ? getAccountMenuItems(isProvider) : [];

  // Same pattern as AccountTabs.tsx's handleLogout: POST clears the BFF
  // session cookies (best-effort backend revoke, see that route), then
  // leave wherever the person was and refresh so the header/page no
  // longer show a signed-in state. This is the only sign-out control
  // reachable on mobile — the desktop equivalent lives in AccountMenu,
  // which isn't in the hamburger at all.
  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      setOpen(false);
      router.push('/');
      router.refresh();
    }
  }

  useEffect(() => {
    if (!open) return undefined;
    firstLinkRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [open]);

  const accountLinkClass =
    'min-h-11 rounded-sm px-3 py-2.5 text-label font-semibold text-primary hover:bg-surface-elevated';

  return (
    <div className="relative shrink-0 xl:hidden" ref={containerRef}>
      <IconButton
        aria-label={open ? t('closeMenu') : t('openMenu')}
        aria-expanded={open}
        aria-controls="mobile-nav-panel"
        onClick={() => setOpen((value) => !value)}
      >
        <span aria-hidden="true" className="text-xl leading-none">
          {open ? '✕' : '☰'}
        </span>
      </IconButton>

      {open && (
        <div
          id="mobile-nav-panel"
          className="absolute right-0 top-full z-50 mt-2 w-64 max-w-[calc(100vw-1.5rem)] rounded-md border border-border bg-surface p-2 shadow-md"
        >
          <nav aria-label={t('primaryNavigation')} className="flex flex-col gap-1">
            {navItems.map((item, index) => (
              <Link
                key={item.href}
                href={item.href}
                ref={index === 0 ? firstLinkRef : undefined}
                onClick={() => setOpen(false)}
                className="min-h-11 rounded-sm px-3 py-2.5 text-body text-text-primary hover:bg-surface-elevated"
              >
                {item.label}
              </Link>
            ))}
            {isAuthenticated && (
              <NextLink
                href="/events/create"
                onClick={() => setOpen(false)}
                className="min-h-11 rounded-sm px-3 py-2.5 text-label font-semibold text-primary hover:bg-surface-elevated"
              >
                {t('createEvent')}
              </NextLink>
            )}
            {isAuthenticated ? (
              accountItems.map((item) =>
                item.localePrefixed ? (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={accountLinkClass}
                  >
                    {t(item.labelKey)}
                  </Link>
                ) : (
                  <NextLink
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={accountLinkClass}
                  >
                    {t(item.labelKey)}
                  </NextLink>
                ),
              )
            ) : (
              <Link
                href={loginHref}
                onClick={() => setOpen(false)}
                className={accountLinkClass}
              >
                {loginLabel}
              </Link>
            )}
            {isAuthenticated && (
              <button
                type="button"
                onClick={handleLogout}
                disabled={loggingOut}
                className="min-h-11 rounded-sm px-3 py-2.5 text-left text-label font-semibold text-text-secondary transition-colors hover:bg-surface-elevated hover:text-text-primary disabled:opacity-60"
              >
                {loggingOut ? tAccount('loggingOutButton') : tAccount('logoutButton')}
              </button>
            )}
          </nav>
        </div>
      )}
    </div>
  );
}
