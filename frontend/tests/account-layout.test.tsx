import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import AccountLayout from '@/app/[locale]/(customer)/account/layout';

// lib/auth/session.ts (imported for readSession) is guarded by the
// `server-only` package — same reasoning as tests/header.test.tsx.
vi.mock('server-only', () => ({}));

// Same reasoning as tests/header.test.tsx: an async Server Component that
// awaits next/headers' cookies() directly needs that mocked outside a
// real Next.js request. `redirect` (next-intl's, from lib/i18n/navigation)
// mirrors Next's own — it throws once called, so the mock does the same,
// letting a test assert both that it was called with the right target
// AND that nothing after it executed.
let accessTokenCookieValue: string | undefined;

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === 'spotva_access_token' && accessTokenCookieValue ? { value: accessTokenCookieValue } : undefined,
  }),
}));

// A single-argument mock (not `(...args)`) deliberately — passing
// `args` straight through (rather than spread) sidesteps two issues at
// once: `vi.mock`'s factory is hoisted above `const redirectMock = ...`
// (a TDZ error for a direct `redirect: redirectMock` reference, fixed by
// wrapping it in a function that only resolves the reference at call
// time), and spreading a plain `unknown[]` into a call requires either a
// tuple type or a rest-parameter target, which a loosely-typed `vi.fn()`
// mock isn't.
const redirectMock = vi.fn<(call: unknown) => never>(() => {
  throw new Error('NEXT_REDIRECT');
});
vi.mock('@/lib/i18n/navigation', () => ({
  redirect: (call: unknown) => redirectMock(call),
}));

vi.mock('@/components/features/account/AccountTabs', () => ({
  AccountTabs: () => <nav data-testid="account-tabs" />,
}));

vi.mock('next-intl/server', () => ({
  setRequestLocale: () => {},
}));

async function renderLayout(children: React.ReactNode = <div>child content</div>) {
  const element = await AccountLayout({ children, params: Promise.resolve({ locale: 'en' }) });
  return render(element);
}

describe('AccountLayout', () => {
  beforeEach(() => {
    redirectMock.mockClear();
  });

  it('redirects to /login?redirect=/account/bookings when there is no session cookie', async () => {
    accessTokenCookieValue = undefined;
    await expect(renderLayout()).rejects.toThrow('NEXT_REDIRECT');
    expect(redirectMock).toHaveBeenCalledWith({
      href: `/login?redirect=${encodeURIComponent('/account/bookings')}`,
      locale: 'en',
    });
  });

  it('renders the tab nav and children when a session cookie is present, without redirecting', async () => {
    accessTokenCookieValue = 'a-real-access-token';
    await renderLayout(<div>child content</div>);
    expect(redirectMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('account-tabs')).toBeInTheDocument();
    expect(screen.getByText('child content')).toBeInTheDocument();
  });
});
