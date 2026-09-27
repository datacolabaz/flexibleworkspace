import { cookies } from 'next/headers';
import NextLink from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/lib/i18n/navigation';
import { Logo } from '@/components/ui/Logo';
import { readSession } from '@/lib/auth/session';
import { getMyProfile } from '@/lib/api-client/account';
import { getMyProvider, ProviderApiError } from '@/lib/api-client/provider-dashboard';
import { LanguageSwitcher } from './LanguageSwitcher';
import { ThemeToggle } from './ThemeToggle';
import { MobileMenu } from './MobileMenu';
import { AccountMenu } from './AccountMenu';
import type { ProviderNavState } from './account-menu-items';

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
 * Provider vs customer in the account menu is `getMyProvider` success,
 * not merely "has a session". `NOT_A_PROVIDER` is the customer/organizer
 * menu plus onboarding; other API errors leave exclusive role links off
 * so the header never flashes the wrong set.
 *
 * Desktop primary nav is `xl:flex` (not `lg:flex`). After login, extra
 * items ("Məkan idarəsi", "Tədbir yarat") plus language/theme/AccountMenu
 * overflow a 1024px row. Hiding the link row until `xl` (hamburger until
 * then) keeps the right cluster intact. Nav starts after the wordmark
 * (`justify-start`, `min-w-0`) so "Ana səhifə" cannot paint under the logo.
 * The row is `overflow-visible` so "Tədbir yarat" is not clipped and the
 * account dropdown can paint below the 64px bar. The profile trigger
 * ellipsizes; language stays a short AZ/EN/RU control.
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

  let isProvider: ProviderNavState;
  if (!accessToken) {
    isProvider = false;
  } else {
    try {
      await getMyProvider(accessToken);
      isProvider = true;
    } catch (error) {
      if (error instanceof ProviderApiError && error.code === 'NOT_A_PROVIDER') {
        isProvider = false;
      } else {
        isProvider = undefined;
      }
    }
  }

  // First name only — avoids overflow at the md breakpoint where the
  // header is tightest. Initials (up to 2 chars) drive the avatar circle.
  const firstName = displayName ? displayName.split(' ')[0] : null;
  const initials = displayName
    ? displayName
        .split(' ')
        .slice(0, 2)
        .map((w) => w[0] ?? '')
        .join('')
        .toUpperCase()
    : null;

  const navItems = [
    { href: '/', label: t('homeLink') },
    { href: '/search', label: t('spaces') },
    { href: '/events', label: t('events') },
    { href: '/how-it-works', label: t('howItWorks') },
    { href: '/for-businesses', label: t('forBusinesses') },
  ];

  const loginHref = '/login';
  const loginLabel = t('login');
  const accountLabel = firstName ?? t('account');

  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-label focus:text-primary-on"
      >
        {t('skipToContent')}
      </a>
      <header className="sticky top-0 z-40 overflow-visible border-b border-border bg-surface">
        <div className="mx-auto flex h-16 max-w-6xl min-w-0 items-center gap-3 overflow-visible px-3 sm:gap-4 sm:px-4 xl:gap-5">
          <Link
            href="/"
            aria-label={t('home')}
            title={t('home')}
            className="relative z-10 shrink-0 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
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

          <nav aria-label={t('primaryNavigation')} className="hidden min-w-0 flex-1 items-center justify-start gap-x-1 overflow-visible xl:flex">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="group relative inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-md px-1.5 text-nav text-text-secondary transition-[color,background-color,transform] duration-150 hover:-translate-y-px hover:bg-surface-elevated hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary after:absolute after:bottom-1 after:left-1.5 after:right-1.5 after:h-px after:origin-left after:scale-x-0 after:bg-accent after:transition-transform after:duration-200 hover:after:scale-x-100"
              >
                {item.label}
              </Link>
            ))}
            {isProvider === true && (
              <NextLink
                href="/provider"
                className="group relative inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-md px-1.5 text-nav font-semibold text-accent hover:bg-surface-elevated"
              >
                {t('manageSpaces')}
              </NextLink>
            )}
            {isAuthenticated && (
              <NextLink
                href="/events/create"
                className="group relative inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-md px-1.5 text-nav font-semibold text-primary hover:bg-surface-elevated"
              >
                {t('createEvent')}
              </NextLink>
            )}
          </nav>

          <div className="relative z-50 ml-1 flex min-w-0 shrink-0 items-center justify-end gap-1 sm:ml-2 sm:gap-1.5">
            <LanguageSwitcher />
            <div className="shrink-0">
              <ThemeToggle />
            </div>
            {isAuthenticated ? (
              <AccountMenu
                label={accountLabel}
                fullName={displayName}
                initials={initials}
                isProvider={isProvider}
              />
            ) : (
              <Link
                href={loginHref}
                className="hidden min-h-11 max-w-[10rem] min-w-0 items-center gap-2 overflow-hidden rounded-md bg-accent px-3 text-label font-semibold text-accent-on hover:bg-accent-hover sm:inline-flex lg:px-4"
              >
                {loginLabel}
              </Link>
            )}
            <MobileMenu
              navItems={navItems}
              loginHref={loginHref}
              loginLabel={loginLabel}
              isAuthenticated={isAuthenticated}
              isProvider={isProvider}
            />
          </div>
        </div>
      </header>
    </>
  );
}
