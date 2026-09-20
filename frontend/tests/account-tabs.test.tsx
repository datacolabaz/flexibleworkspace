import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '../messages/en.json';
import { AccountTabs } from '@/components/features/account/AccountTabs';

let mockPathname = '/account/bookings';
const mockPush = vi.fn();
const mockRefresh = vi.fn();
vi.mock('@/lib/i18n/navigation', () => ({
  Link: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href as string} {...props}>
      {children}
    </a>
  ),
  usePathname: () => mockPathname,
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}));

function renderTabs() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <AccountTabs />
    </NextIntlClientProvider>,
  );
}

describe('AccountTabs', () => {
  beforeEach(() => {
    mockPathname = '/account/bookings';
    mockPush.mockClear();
    mockRefresh.mockClear();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: true }), { status: 200 })));
  });

  it('renders Bookings, Favorites, Reviews, Payment history, and Profile tabs linking to their own pages', () => {
    renderTabs();
    expect(screen.getByRole('link', { name: 'Bookings' })).toHaveAttribute('href', '/account/bookings');
    expect(screen.getByRole('link', { name: 'Favorites' })).toHaveAttribute('href', '/account/favorites');
    expect(screen.getByRole('link', { name: 'Reviews' })).toHaveAttribute('href', '/account/reviews');
    expect(screen.getByRole('link', { name: 'Payment history' })).toHaveAttribute('href', '/account/payment-history');
    expect(screen.getByRole('link', { name: 'Profile' })).toHaveAttribute('href', '/account/profile');
  });

  it('marks the Profile tab current when on /account/profile', () => {
    mockPathname = '/account/profile';
    renderTabs();
    expect(screen.getByRole('link', { name: 'Profile' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Bookings' })).not.toHaveAttribute('aria-current');
  });

  it('logs out: POSTs to the BFF logout route, then leaves /account entirely', async () => {
    renderTabs();
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/'));
    expect(fetch).toHaveBeenCalledWith('/api/auth/logout', { method: 'POST' });
    expect(mockRefresh).toHaveBeenCalled();
  });
});
