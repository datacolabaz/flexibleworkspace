import { cookies } from 'next/headers';
import { setRequestLocale } from 'next-intl/server';
import { redirect } from '@/lib/i18n/navigation';
import { readSession } from '@/lib/auth/session';
import { AccountTabs } from '@/components/features/account/AccountTabs';

/**
 * Shared shell for `/account/*` (06_INFORMATION_ARCHITECTURE.md §6.1:
 * `/{locale}/account/bookings`, `/{locale}/account/favorites`) — both are
 * SSR-via-BFF-cookie per FRONTEND_IMPLEMENTATION_PLAN.md §4, so unlike
 * the room detail page's *soft* session check (an anonymous visitor can
 * still see the room), this is a hard auth wall: there is no anonymous
 * "my bookings" or "my favorites" to show. A layout runs on every
 * navigation into the routes it wraps, so checking once here — rather
 * than duplicating the same redirect in every page under it — is
 * sufficient; there's no way to reach a page in this tree without this
 * layout having rendered first.
 *
 * Redirects to `/login?redirect=/account/bookings` rather than back to
 * whichever sub-page was requested — the layout itself doesn't know the
 * exact requested path (Next doesn't hand a layout the child segment),
 * and `/account/bookings` is the natural landing page either way.
 */
export default async function AccountLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const store = await cookies();
  const { accessToken } = readSession(store);
  if (!accessToken) {
    redirect({ href: `/login?redirect=${encodeURIComponent('/account/bookings')}`, locale });
  }

  return (
    <main id="main-content" className="mx-auto min-h-[calc(100vh-4rem)] max-w-4xl px-4 py-8 sm:px-6">
      <AccountTabs />
      <div className="mt-6">{children}</div>
    </main>
  );
}
