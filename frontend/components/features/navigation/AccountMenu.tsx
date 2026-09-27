'use client';

import { useEffect, useRef, useState } from 'react';
import NextLink from 'next/link';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/lib/i18n/navigation';
import { getAccountMenuItems, type ProviderNavState } from './account-menu-items';

/**
 * Signed-in account control for the sticky header. Replaces the single
 * `/account/bookings` link so provider vs customer destinations can
 * differ without changing that bookings route's purpose. Logout matches
 * `AccountTabs` / `MobileMenu`: POST `/api/auth/logout`, then home + refresh.
 */
export function AccountMenu({
  label,
  fullName,
  initials,
  isProvider,
}: {
  label: string;
  fullName?: string | null;
  initials: string | null;
  isProvider: ProviderNavState;
}) {
  const t = useTranslations('nav');
  const tAccount = useTranslations('account');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const firstLinkRef = useRef<HTMLAnchorElement>(null);
  const items = getAccountMenuItems(isProvider);

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

  const menuName = (fullName ?? label).trim();

  return (
    <div className="relative z-50 hidden min-w-0 overflow-visible sm:block" ref={containerRef}>
      <button
        type="button"
        aria-label={t('accountMenu')}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="account-menu-panel"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex min-h-11 min-w-0 max-w-[8.5rem] items-center gap-1.5 overflow-hidden rounded-md bg-accent px-2.5 text-label font-semibold text-accent-on hover:bg-accent-hover lg:max-w-[11rem] lg:px-3"
      >
        {initials && (
          <span
            aria-hidden="true"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-on/20 text-[0.6rem] font-bold leading-none"
          >
            {initials}
          </span>
        )}
        <span className="hidden min-w-0 truncate lg:inline">{label}</span>
        <span
          aria-hidden="true"
          className="shrink-0 text-xs leading-none transition-transform duration-200"
          style={{ display: 'inline-block', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
        >
          ▾
        </span>
      </button>

      {open && (
        <div
          id="account-menu-panel"
          className="absolute right-0 top-full z-[60] mt-2 w-64 max-w-[calc(100vw-1.5rem)] rounded-md border border-border bg-surface p-2 shadow-md"
        >
          {menuName ? (
            <p className="truncate px-3 py-2 text-small font-semibold text-text-primary" title={menuName}>
              {menuName}
            </p>
          ) : null}
          <nav aria-label={t('accountMenu')} className="flex flex-col gap-1">
            {items.map((item, index) => {
              const className =
                'min-h-11 rounded-sm px-3 py-2.5 text-left text-label font-semibold text-text-primary hover:bg-surface-elevated';
              const common = {
                onClick: () => setOpen(false),
                className,
                ref: index === 0 ? firstLinkRef : undefined,
              };
              if (item.localePrefixed) {
                return (
                  <Link key={item.href} href={item.href} {...common}>
                    {t(item.labelKey)}
                  </Link>
                );
              }
              return (
                <NextLink key={item.href} href={item.href} {...common}>
                  {t(item.labelKey)}
                </NextLink>
              );
            })}
            <button
              type="button"
              onClick={handleLogout}
              disabled={loggingOut}
              className="min-h-11 rounded-sm px-3 py-2.5 text-left text-label font-semibold text-text-secondary transition-colors hover:bg-surface-elevated hover:text-text-primary disabled:opacity-60"
            >
              {loggingOut ? tAccount('loggingOutButton') : tAccount('logoutButton')}
            </button>
          </nav>
        </div>
      )}
    </div>
  );
}
