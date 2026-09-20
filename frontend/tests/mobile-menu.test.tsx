import { forwardRef } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '../messages/en.json';
import { MobileMenu } from '@/components/features/navigation/MobileMenu';

const mockPush = vi.fn();
const mockRefresh = vi.fn();

// forwardRef here (not a plain function) to match the real next-intl
// `Link`'s ref-forwarding — MobileMenu focuses the first nav link on
// open, which needs a real DOM ref to reach.
vi.mock('@/lib/i18n/navigation', () => ({
  // preventDefault on click: jsdom doesn't implement real navigation, and
  // an unhandled <a href> click logs a noisy "Not implemented: navigation"
  // error — real next-intl `Link`s manage routing client-side, so this
  // matches that behavior rather than a real page load.
  Link: forwardRef<HTMLAnchorElement, React.AnchorHTMLAttributes<HTMLAnchorElement>>(function Link(
    { children, onClick, ...props },
    ref,
  ) {
    return (
      <a
        ref={ref}
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
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}));

const navItems = [
  { href: '/search', label: 'Search' },
  { href: '/how-it-works', label: 'How it works' },
];

function renderMenu(isAuthenticated = false) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <MobileMenu navItems={navItems} loginHref="/login" loginLabel="Log in" isAuthenticated={isAuthenticated} />
    </NextIntlClientProvider>,
  );
}

describe('MobileMenu', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockRefresh.mockClear();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: true }), { status: 200 })));
  });

  it('starts closed, with the toggle reporting aria-expanded=false', () => {
    renderMenu();
    expect(screen.getByRole('button', { name: 'Open menu' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  it('opens the panel on click, listing every nav item plus the login link', () => {
    renderMenu();
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    expect(screen.getByRole('button', { name: 'Close menu' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('link', { name: 'Search' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'How it works' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Log in' })).toBeInTheDocument();
  });

  it('moves focus to the first nav item when it opens', () => {
    renderMenu();
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    expect(screen.getByRole('link', { name: 'Search' })).toHaveFocus();
  });

  it('closes when a nav link is clicked', () => {
    renderMenu();
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    fireEvent.click(screen.getByRole('link', { name: 'Search' }));
    expect(screen.getByRole('button', { name: 'Open menu' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes on Escape', () => {
    renderMenu();
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByRole('button', { name: 'Open menu' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes on a click outside the menu', () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <div>
          <button type="button">outside</button>
          <MobileMenu navItems={navItems} loginHref="/login" loginLabel="Log in" isAuthenticated={false} />
        </div>
      </NextIntlClientProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    fireEvent.mouseDown(screen.getByRole('button', { name: 'outside' }));
    expect(screen.getByRole('button', { name: 'Open menu' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('does not show a logout action when signed out', () => {
    renderMenu(false);
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    expect(screen.queryByRole('button', { name: 'Log out' })).not.toBeInTheDocument();
  });

  it('shows a logout action when signed in, and logs out on click', async () => {
    renderMenu(true);
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/'));
    expect(fetch).toHaveBeenCalledWith('/api/auth/logout', { method: 'POST' });
    expect(mockRefresh).toHaveBeenCalled();
  });
});
