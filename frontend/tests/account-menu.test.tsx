import { forwardRef } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '../messages/en.json';
import { AccountMenu } from '@/components/features/navigation/AccountMenu';

const mockPush = vi.fn();
const mockRefresh = vi.fn();

vi.mock('@/lib/i18n/navigation', () => ({
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

function renderMenu(isProvider: boolean | undefined) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <AccountMenu label="Account" fullName="Account" initials={null} isProvider={isProvider} />
    </NextIntlClientProvider>,
  );
}

describe('AccountMenu', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockRefresh.mockClear();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: true }), { status: 200 })));
  });

  it('keeps a visible chevron on the trigger so it is not mistaken for a single Account link', () => {
    renderMenu(false);
    const trigger = screen.getByRole('button', { name: 'Account menu' });
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveTextContent('▾');
    expect(screen.queryByRole('link', { name: 'My bookings' })).not.toBeInTheDocument();
  });

  it('opens a dropdown of account links for a provider instead of a single Provider dashboard CTA', () => {
    renderMenu(true);
    fireEvent.click(screen.getByRole('button', { name: 'Account menu' }));
    expect(document.getElementById('account-menu-panel')).not.toBeNull();
    expect(screen.getByRole('link', { name: 'Provider dashboard' })).toHaveAttribute('href', '/provider');
    expect(screen.getByRole('link', { name: 'Analytics' })).toHaveAttribute('href', '/provider#provider-analytics');
    expect(screen.getByRole('link', { name: 'Earnings and payouts' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'My spaces' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'My account' })).toHaveAttribute('href', '/account/profile');
    expect(screen.getByRole('link', { name: 'My bookings' })).toHaveAttribute('href', '/account/bookings');
    expect(screen.getByRole('link', { name: 'My events' })).toHaveAttribute('href', '/account/events');
    expect(screen.getByRole('link', { name: 'My attendances' })).toHaveAttribute('href', '/account/tickets');
    expect(screen.getByRole('link', { name: 'My favorites' })).toHaveAttribute('href', '/account/favorites');
    expect(screen.getByRole('button', { name: 'Log out' })).toBeInTheDocument();
  });

  it('does not render role-exclusive links while provider status is unknown (loading)', () => {
    renderMenu(undefined);
    fireEvent.click(screen.getByRole('button', { name: 'Account menu' }));
    expect(screen.getByRole('link', { name: 'My bookings' })).toHaveAttribute('href', '/account/bookings');
    expect(screen.queryByRole('link', { name: 'Analytics' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Become a provider / List a space' })).not.toBeInTheDocument();
  });

  it('is keyboard-closable with Escape and focuses the first item when opened', () => {
    renderMenu(false);
    fireEvent.click(screen.getByRole('button', { name: 'Account menu' }));
    expect(screen.getByRole('link', { name: 'My account' })).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('link', { name: 'My account' })).not.toBeInTheDocument();
  });

  it('logs out then navigates home so a re-render can swap to the anonymous CTA', async () => {
    renderMenu(false);
    fireEvent.click(screen.getByRole('button', { name: 'Account menu' }));
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/'));
    expect(fetch).toHaveBeenCalledWith('/api/auth/logout', { method: 'POST' });
    expect(mockRefresh).toHaveBeenCalled();
  });
});
