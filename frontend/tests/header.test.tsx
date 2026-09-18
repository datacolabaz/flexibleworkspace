import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '../messages/en.json';
import { Header } from '@/components/features/navigation/Header';

// Header pulls in lib/auth/session.ts (server-only-guarded) — mocked for
// the same reason tests/api-client.test.ts and tests/auth-routes.test.ts
// mock it: the package's default resolution throws unconditionally
// outside Next's "react-server" bundler condition, which Vitest doesn't
// set.
vi.mock('server-only', () => ({}));

// Header is an async Server Component — it awaits next/headers' cookies()
// and next-intl/server's getTranslations() directly in its own body, both
// of which need Next's real request context to run outside a Next.js
// request (they throw an invariant otherwise, the same reason
// tests/auth-routes.test.ts calls its route handlers' exported functions
// directly rather than through a real server). Mocked here the same way.
let accessTokenCookieValue: string | undefined;

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === 'spotva_access_token' && accessTokenCookieValue ? { value: accessTokenCookieValue } : undefined,
  }),
}));

vi.mock('next-intl/server', () => ({
  getTranslations: async (arg: string | { namespace?: string } | undefined) => {
    const namespace = typeof arg === 'string' ? arg : arg?.namespace;
    const dict = (namespace ? (messages as Record<string, unknown>)[namespace] : messages) as Record<string, string>;
    return (key: string) => dict[key] ?? key;
  },
}));

vi.mock('@/lib/i18n/navigation', () => ({
  Link: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href as string} {...props}>
      {children}
    </a>
  ),
  usePathname: () => '/',
  useRouter: () => ({ replace: vi.fn() }),
}));

// Header returns a Promise (it's async) — calling it directly and
// awaiting the result, rather than writing `<Header />` and letting
// react-dom try to render an async component (which it can't, outside
// Next's own RSC renderer), resolves it to a plain element tree that
// render() can mount normally, nested Client Components included.
async function renderHeader() {
  const element = await Header();
  return render(<NextIntlClientProvider locale="en" messages={messages}>{element}</NextIntlClientProvider>);
}

describe('Header', () => {
  beforeEach(() => {
    accessTokenCookieValue = undefined;
  });

  it('routes Search / How it works / For businesses to their real pages (06_INFORMATION_ARCHITECTURE.md §6.5)', async () => {
    await renderHeader();
    expect(screen.getByRole('link', { name: 'Search' })).toHaveAttribute('href', '/search');
    expect(screen.getByRole('link', { name: 'How it works' })).toHaveAttribute('href', '/how-it-works');
    expect(screen.getByRole('link', { name: 'For businesses' })).toHaveAttribute('href', '/for-businesses');
  });

  it('shows "Log in" -> /login when there is no session cookie', async () => {
    await renderHeader();
    const loginLinks = screen.getAllByRole('link', { name: 'Log in' });
    expect(loginLinks.length).toBeGreaterThan(0);
    for (const link of loginLinks) expect(link).toHaveAttribute('href', '/login');
    expect(screen.queryByRole('link', { name: 'Account' })).not.toBeInTheDocument();
  });

  it('shows "Account" -> /account/bookings once the BFF session cookie is present — a real server-side check, not a client guess', async () => {
    accessTokenCookieValue = 'a-real-access-token';
    await renderHeader();
    const accountLinks = screen.getAllByRole('link', { name: 'Account' });
    expect(accountLinks.length).toBeGreaterThan(0);
    for (const link of accountLinks) expect(link).toHaveAttribute('href', '/account/bookings');
    expect(screen.queryByRole('link', { name: 'Log in' })).not.toBeInTheDocument();
  });

  it('renders a skip-to-content link targeting #main-content', async () => {
    await renderHeader();
    expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveAttribute('href', '#main-content');
  });

  it('includes the mobile menu toggle alongside the desktop nav (both markups render; CSS picks one per breakpoint)', async () => {
    await renderHeader();
    expect(screen.getByRole('button', { name: 'Open menu' })).toBeInTheDocument();
  });

  it('links the logo to home with an accessible name', async () => {
    await renderHeader();
    expect(screen.getByRole('link', { name: 'Spotva home' })).toHaveAttribute('href', '/');
  });
});
