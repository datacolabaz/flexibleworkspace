import { cookies } from 'next/headers';
import NextLink from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/lib/i18n/navigation';
import { Logo } from '@/components/ui/Logo';
import { readSession } from '@/lib/auth/session';
import { getMyProfile } from '@/lib/api-client/account';
import { LanguageSwitcher } from './LanguageSwitcher';
import { ThemeToggle } from './ThemeToggle';
import { MobileMenu } from './MobileMenu';

/**
 * The customer-facing site header — 06_INFORMATION_ARCHITECTURE.md §6.5's
 * primary nav exactly: "Search (always visible, sticky on scroll) · How
 * it works · For businesses · Language switcher · Account/Login". No
 * category mega-menu (§6.5 explicitly rules that out).
 *
 * An async Server Component (mounted once in app/[locale]/layout.tsx, so
 * every customer page gets it for free) — it reads the session cookie
 * directly via next/headers to decide Login vs Account server-side,
 * rather than shipping that check to the client. `search`/`how-it-works`/
 * `for-businesses` route to real (currently placeholder) pages rather
 * than dead links — see their page.tsx files' own comments.
 *
 * The desktop nav's `gap-4 md:flex lg:gap-6` and the Account/Login
 * button's `px-3 ... lg:px-4` (neither a flat `gap-6`/`px-4`) are a
 * live-found fix, not the original spacing: every prior visual pass only
 * ever exercised the signed-out ("Log in") header, since there was no way
 * to hold a real authenticated session through Playwright before the
 * /account milestone. "Account" is one character wider than "Log in",
 * and at exactly the md breakpoint (768px) that was enough to overflow
 * — invisible until this milestone could actually load the header signed
 * in. Both are tightened only at md (768–1023px, where the desktop nav
 * first appears and the row is tightest); lg+ keeps the original
 * gap-6/px-4.
 */
export async function Header() {
  const t = await getTranslations('nav');
  const store = await cookies();
  const { accessToken } = readSession(store);
  const isAuthenticated = Boolean(accessToken);

  // Prefer the signed-in person's own name over the generic "Account"
  // label — a real per-request lookup (not a JWT claim) so a profile
  // edit (ProfileForm, `/account/profile`) shows up here immediately,
  // without waiting for the person to sign in again. An OTP-only account
  // that never set a display name, or an expired/invalid token (the
  // page's own auth check — not this decorative header — is what
  // actually redirects to /login), both fall back to the generic label
  // rather than breaking the header.
  let displayName: string | null = null;
  if (accessToken) {
    try {
      const profile = await getMyProfile(accessToken);
      displayName = profile.displayName ?? null;
    } catch {
      displayName = null;
    }
  }

  const navItems = [
    { href: '/', label: t('homeLink') },
    { href: '/search', label: t('spaces') },
    { href: '/events', label: t('events') },
    { href: '/how-it-works', label: t('howItWorks') },
    { href: '/for-businesses', label: t('forBusinesses') },
  ];

  const loginHref = isAuthenticated ? '/account/bookings' : '/login';
  const loginLabel = isAuthenticated ? (displayName ?? t('account')) : t('login');

  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-label focus:text-primary-on"
      >
        {t('skipToContent')}
      </a>
      <header className="sticky top-0 z-40 border-b border-border bg-surface">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-2 px-3 sm:gap-4 sm:px-4">
          <Link
            href="/"
            aria-label={t('home')}
            title={t('home')}
            className="group shrink-0 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
          >
            {/* Text-only wordmark, not the icon+wordmark lockup — the
                owner's explicit choice for the navbar specifically. Two
                sizes rather than one, per the brand asset's own navbar
                guidance: ~46px tall (125px wide) below the `sm` breakpoint,
                ~55px tall (150px wide) at `sm` and up — this header's
                h-16 (64px) row was sized for exactly that. */}
            <Logo variant="wordmark" height={46} className="sm:hidden" />
            <Logo variant="wordmark" height={55} className="hidden sm:block" />
          </Link>

          <nav aria-label={t('primaryNavigation')} className="hidden items-center gap-1 lg:flex xl:gap-4">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="group relative inline-flex min-h-11 items-center whitespace-nowrap rounded-md px-2 text-nav text-text-secondary transition-[color,background-color,transform] duration-150 hover:-translate-y-px hover:bg-surface-elevated hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary after:absolute after:bottom-1 after:left-2 after:right-2 after:h-px after:origin-left after:scale-x-0 after:bg-accent after:transition-transform after:duration-200 hover:after:scale-x-100"
              >
                {item.label}
              </Link>
            ))}
            {isAuthenticated && <NextLink href="/provider" className="group relative inline-flex min-h-11 items-center whitespace-nowrap rounded-md px-2 text-nav font-semibold text-accent hover:bg-surface-elevated">Məkan idarəsi</NextLink>}
            {isAuthenticated && <NextLink href="/events/create" className="group relative inline-flex min-h-11 items-center whitespace-nowrap rounded-md px-2 text-nav font-semibold text-primary hover:bg-surface-elevated">Tədbir yarat</NextLink>}
          </nav>

          <div className="flex min-w-0 items-center gap-1 sm:gap-2">
            <LanguageSwitcher />
            <ThemeToggle />
            <Link
              href={loginHref}
              className="hidden min-h-11 max-w-[10rem] items-center truncate rounded-md bg-accent px-3 text-label font-semibold text-accent-on hover:bg-accent-hover sm:inline-flex lg:px-4"
            >
              {loginLabel}
            </Link>
            <MobileMenu
              navItems={navItems}
              loginHref={loginHref}
              loginLabel={loginLabel}
              isAuthenticated={isAuthenticated}
              isProvider={isAuthenticated}
            />
          </div>
        </div>
      </header>
    </>
  );
}
