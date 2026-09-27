import { forwardRef } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

const mockPush = vi.fn();
const mockRefresh = vi.fn();

vi.mock('@/lib/i18n/navigation', () => ({
  Link: forwardRef<HTMLAnchorElement, React.AnchorHTMLAttributes<HTMLAnchorElement>>(function Link(
    { href, children, onClick, ...props },
    ref,
  ) {
    return (
      <a
        ref={ref}
        href={href as string}
        {...props}
        onClick={(event) => {
          event.preventDefault();
          onClick?.(event);
        }}
      >
        {children}
      </a>
    );
  }),
  usePathname: () => '/',
  useRouter: () => ({ replace: vi.fn(), push: mockPush, refresh: mockRefresh }),
}));

// Header calls getMyProfile to show the signed-in person's own name
// instead of the generic "Account" label. Defaults to a rejection (no
// BACKEND_API_URL in this test env would throw the same way) so every
// pre-existing test — which never sets displayNameToReturn — keeps
// exercising the fallback-to-"Account" path unchanged.
let displayNameToReturn: string | null | undefined;
vi.mock('@/lib/api-client/account', () => ({
  getMyProfile: async () => {
    if (displayNameToReturn === undefined) throw new Error('BACKEND_API_URL is not set.');
    return { displayName: displayNameToReturn };
  },
}));

type ProviderResult = 'success' | 'not_a_provider' | 'error';
let providerResult: ProviderResult = 'not_a_provider';

vi.mock('@/lib/api-client/provider-dashboard', () => {
  class ProviderApiError extends Error {
    constructor(
      readonly status: number,
      readonly code: string,
      message: string,
    ) {
      super(message);
      this.name = 'ProviderApiError';
    }
  }
  return {
    ProviderApiError,
    getMyProvider: async () => {
      if (providerResult === 'success') {
        return { id: 'provider-1', displayName: 'Studio', legalName: 'Studio LLC' };
      }
      if (providerResult === 'not_a_provider') {
        throw new ProviderApiError(403, 'NOT_A_PROVIDER', 'Not a provider.');
      }
      throw new Error('PROVIDER_API_UNAVAILABLE');
    },
  };
});

// Header returns a Promise (it's async) — calling it directly and
// awaiting the result, rather than writing `<Header />` and letting
// react-dom try to render an async component (which it can't, outside
// Next's own RSC renderer), resolves it to a plain element tree that
// render() can mount normally, nested Client Components included.
async function renderHeader() {
  const element = await Header();
  return render(<NextIntlClientProvider locale="en" messages={messages}>{element}</NextIntlClientProvider>);
}

function openAccountMenu() {
  fireEvent.click(screen.getByRole('button', { name: 'Account menu' }));
}

function openMobileMenu() {
  fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
}

describe('Header', () => {
  beforeEach(() => {
    accessTokenCookieValue = undefined;
    displayNameToReturn = undefined;
    providerResult = 'not_a_provider';
    mockPush.mockClear();
    mockRefresh.mockClear();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: true }), { status: 200 })));
  });

  it('routes Spaces / Events / How it works / For businesses to their real pages (06_INFORMATION_ARCHITECTURE.md §6.5)', async () => {
    await renderHeader();
    expect(screen.getByRole('link', { name: 'Spaces' })).toHaveAttribute('href', '/search');
    expect(screen.getByRole('link', { name: 'Events' })).toHaveAttribute('href', '/events');
    expect(screen.getByRole('link', { name: 'How it works' })).toHaveAttribute('href', '/how-it-works');
    expect(screen.getByRole('link', { name: 'For businesses' })).toHaveAttribute('href', '/for-businesses');
  });

  it('shows only a Log in CTA when there is no session cookie (anonymous)', async () => {
    await renderHeader();
    const loginLinks = screen.getAllByRole('link', { name: 'Log in' });
    expect(loginLinks.length).toBeGreaterThan(0);
    for (const link of loginLinks) expect(link).toHaveAttribute('href', '/login');
    expect(screen.queryByRole('button', { name: 'Account menu' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'My bookings' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Analytics' })).not.toBeInTheDocument();
  });

  it('shows a customer account menu after a session cookie, with My bookings still on /account/bookings', async () => {
    accessTokenCookieValue = 'a-real-access-token';
    await renderHeader();
    expect(screen.queryByRole('link', { name: 'Log in' })).not.toBeInTheDocument();
    openAccountMenu();
    expect(screen.getByRole('link', { name: 'My account' })).toHaveAttribute('href', '/account/profile');
    expect(screen.getByRole('link', { name: 'My bookings' })).toHaveAttribute('href', '/account/bookings');
    expect(screen.getByRole('link', { name: 'My events' })).toHaveAttribute('href', '/account/events');
    expect(screen.getByRole('link', { name: 'My RSVPs' })).toHaveAttribute('href', '/account/tickets');
    expect(screen.getByRole('link', { name: 'My favorites' })).toHaveAttribute('href', '/account/favorites');
    expect(screen.getByRole('link', { name: 'Become a provider / List a space' })).toHaveAttribute(
      'href',
      '/list-your-space',
    );
    expect(screen.queryByRole('link', { name: 'Analytics' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Provider dashboard' })).not.toBeInTheDocument();
  });

  it('treats NOT_A_PROVIDER as the customer/organizer menu (Tədbirlərim stays /account/events)', async () => {
    accessTokenCookieValue = 'a-real-access-token';
    providerResult = 'not_a_provider';
    await renderHeader();
    openAccountMenu();
    expect(screen.getByRole('link', { name: 'My events' })).toHaveAttribute('href', '/account/events');
    expect(screen.getByRole('link', { name: 'Become a provider / List a space' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Manage spaces' })).not.toBeInTheDocument();
  });

  it('shows provider destinations from getMyProvider success, using /provider anchors (not new routes)', async () => {
    accessTokenCookieValue = 'a-real-access-token';
    providerResult = 'success';
    await renderHeader();
    expect(screen.getByRole('link', { name: 'Manage spaces' })).toHaveAttribute('href', '/provider');
    openAccountMenu();
    expect(screen.getByRole('link', { name: 'Provider dashboard' })).toHaveAttribute('href', '/provider');
    expect(screen.getByRole('link', { name: 'Analytics' })).toHaveAttribute('href', '/provider#provider-analytics');
    expect(screen.getByRole('link', { name: 'Earnings and payouts' })).toHaveAttribute(
      'href',
      '/provider#provider-payouts',
    );
    expect(screen.getByRole('link', { name: 'My spaces' })).toHaveAttribute('href', '/provider#provider-rooms');
    expect(screen.getByRole('link', { name: 'My bookings' })).toHaveAttribute('href', '/account/bookings');
    expect(screen.queryByRole('link', { name: 'Become a provider / List a space' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '/provider/analytics' })).not.toBeInTheDocument();
  });

  it('does not flash provider or onboarding links when the provider API errors', async () => {
    accessTokenCookieValue = 'a-real-access-token';
    providerResult = 'error';
    await renderHeader();
    openAccountMenu();
    expect(screen.getByRole('link', { name: 'My bookings' })).toHaveAttribute('href', '/account/bookings');
    expect(screen.queryByRole('link', { name: 'Analytics' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Become a provider / List a space' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Manage spaces' })).not.toBeInTheDocument();
  });

  it('shows the signed-in person\'s own name on the account trigger when their profile has one', async () => {
    accessTokenCookieValue = 'a-real-access-token';
    displayNameToReturn = 'Telman';
    await renderHeader();
    expect(screen.getByRole('button', { name: 'Account menu' })).toHaveTextContent('Telman');
  });

  it('falls back to "Account" when the signed-in person has no display name set (e.g. an OTP-only account)', async () => {
    accessTokenCookieValue = 'a-real-access-token';
    displayNameToReturn = null;
    await renderHeader();
    expect(screen.getByRole('button', { name: 'Account menu' })).toHaveTextContent('Account');
  });

  it('shows the same role-aware links in the mobile menu for a customer', async () => {
    accessTokenCookieValue = 'a-real-access-token';
    await renderHeader();
    openMobileMenu();
    expect(screen.getAllByRole('link', { name: 'My bookings' })[0]).toHaveAttribute('href', '/account/bookings');
    expect(screen.getAllByRole('link', { name: 'Become a provider / List a space' }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: 'Analytics' })).not.toBeInTheDocument();
  });

  it('shows provider links in the mobile menu only for a real provider', async () => {
    accessTokenCookieValue = 'a-real-access-token';
    providerResult = 'success';
    await renderHeader();
    openMobileMenu();
    expect(screen.getAllByRole('link', { name: 'Analytics' })[0]).toHaveAttribute(
      'href',
      '/provider#provider-analytics',
    );
    expect(screen.queryByRole('link', { name: 'Become a provider / List a space' })).not.toBeInTheDocument();
  });

  it('logs out from the account menu and leaves a signed-in header', async () => {
    accessTokenCookieValue = 'a-real-access-token';
    await renderHeader();
    openAccountMenu();
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/'));
    expect(fetch).toHaveBeenCalledWith('/api/auth/logout', { method: 'POST' });
    expect(mockRefresh).toHaveBeenCalled();
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
