import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '../messages/en.json';
import { LoginForm } from '@/components/features/auth/LoginForm';

// LoginForm only decides *whether* to show each button (env-var gated)
// and surfaces their onError callback as a banner — the actual sign-in
// flow (script loading, the BFF POST, the redirect) belongs to
// GoogleSignInButton/FacebookSignInButton themselves, so those are
// mocked here rather than re-exercised through LoginForm.
// Each mock mirrors the real component's own "render nothing without my
// env var" gate (GoogleSignInButton/FacebookSignInButton each check this
// themselves) — LoginForm renders both unconditionally once at least one
// provider is configured and relies on that self-gating, so a mock that
// ignored it would test a behavior LoginForm doesn't actually have.
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
vi.mock('@/components/features/auth/FacebookSignInButton', () => ({
  FacebookSignInButton: ({ onError }: { redirectTo?: string; onError: (message: string) => void }) => {
    if (!process.env.NEXT_PUBLIC_FACEBOOK_APP_ID) return null;
    return (
      <button type="button" onClick={() => onError('facebook failed')}>
        Mock Facebook button
      </button>
    );
  },
}));

function renderLoginForm(redirectTo?: string) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <LoginForm redirectTo={redirectTo} />
    </NextIntlClientProvider>,
  );
}

describe('LoginForm', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('renders both Google and Facebook sign-in when both are configured', () => {
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_CLIENT_ID', 'test-google-client-id');
    vi.stubEnv('NEXT_PUBLIC_FACEBOOK_APP_ID', 'test-facebook-app-id');
    renderLoginForm();

    expect(screen.getByRole('button', { name: 'Mock Google button' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mock Facebook button' })).toBeInTheDocument();
    expect(screen.queryByText(/isn't available right now/i)).not.toBeInTheDocument();
  });

  it('renders only Google when Facebook is not configured', () => {
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_CLIENT_ID', 'test-google-client-id');
    renderLoginForm();

    expect(screen.getByRole('button', { name: 'Mock Google button' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mock Facebook button' })).not.toBeInTheDocument();
  });

  it('shows a fallback message instead of a blank card when neither provider is configured', () => {
    renderLoginForm();

    expect(screen.getByText(/sign-in isn't available right now/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mock Google button' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mock Facebook button' })).not.toBeInTheDocument();
  });

  it('shows the error a sign-in button reports as a banner', () => {
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_CLIENT_ID', 'test-google-client-id');
    renderLoginForm();

    fireEvent.click(screen.getByRole('button', { name: 'Mock Google button' }));

    expect(screen.getByRole('alert')).toHaveTextContent('google failed');
  });
});
