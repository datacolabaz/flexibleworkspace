import { forwardRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '../messages/en.json';
import { MobileMenu } from '@/components/features/navigation/MobileMenu';

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
}));

const navItems = [
  { href: '/search', label: 'Search' },
  { href: '/how-it-works', label: 'How it works' },
];

function renderMenu() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <MobileMenu navItems={navItems} loginHref="/login" loginLabel="Log in" />
    </NextIntlClientProvider>,
  );
}

describe('MobileMenu', () => {
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
          <MobileMenu navItems={navItems} loginHref="/login" loginLabel="Log in" />
        </div>
      </NextIntlClientProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    fireEvent.mouseDown(screen.getByRole('button', { name: 'outside' }));
    expect(screen.getByRole('button', { name: 'Open menu' })).toHaveAttribute('aria-expanded', 'false');
  });
});
