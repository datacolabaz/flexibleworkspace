import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '../messages/en.json';
import azMessages from '../messages/az.json';
import { LoginForm } from '@/components/features/auth/LoginForm';

// LoginForm only decides *whether* to show the Google button (env-var
// gated) and surfaces its onError callback as a banner — the actual
// sign-in flow (script loading, the BFF POST, the redirect) belongs to
// GoogleSignInButton itself, so it's mocked here rather than re-exercised
// through LoginForm.
// The mock mirrors the real component's own "render nothing without my
// env var" gate (GoogleSignInButton checks this itself) — LoginForm
// renders it unconditionally once Google is configured and relies on
// that self-gating, so a mock that ignored it would test a behavior
// LoginForm doesn't actually have.
vi.mock('@/components/features/auth/GoogleSignInButton', () => ({
  GoogleSignInButton: ({ onError }: { redirectTo?: string; onError: (message: string) => void }) => {
    if (!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID) return null;
    return (
      <button type="button" onClick={() => onError('google failed')}>
        Mock Google button
      </button>
    );
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

function renderLoginForm(
  redirectTo?: string,
  adminMode = false,
  locale = 'en',
  localizedMessages = messages,
) {
  return render(
    <NextIntlClientProvider locale={locale} messages={localizedMessages}>
      <LoginForm redirectTo={redirectTo} adminMode={adminMode} />
    </NextIntlClientProvider>,
  );
}

describe('LoginForm', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('renders Google sign-in when configured', () => {
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_CLIENT_ID', 'test-google-client-id');
    renderLoginForm();

    expect(screen.getByRole('button', { name: 'Mock Google button' })).toBeInTheDocument();
    expect(screen.queryByText(/isn't available right now/i)).not.toBeInTheDocument();
  });

  it('shows a fallback message instead of a blank card when Google is not configured', () => {
    renderLoginForm();

    expect(screen.getByText(/sign-in isn't available right now/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mock Google button' })).not.toBeInTheDocument();
  });

  it('shows the error the sign-in button reports as a banner', () => {
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_CLIENT_ID', 'test-google-client-id');
    renderLoginForm();

    fireEvent.click(screen.getByRole('button', { name: 'Mock Google button' }));

    expect(screen.getByRole('alert')).toHaveTextContent('google failed');
  });

  it('uses the generic Azerbaijani Gmail example in admin login mode', () => {
    renderLoginForm(undefined, true, 'az', azMessages);

    expect(screen.getByLabelText('Admin email')).toHaveAttribute('placeholder', 'adınız@gmail.com');
  });
});
