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
      <AccountMenu label="Account" initials={null} isProvider={isProvider} />
    </NextIntlClientProvider>,
  );
}

describe('AccountMenu', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockRefresh.mockClear();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: true }), { status: 200 })));
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
