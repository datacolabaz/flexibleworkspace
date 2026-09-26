import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '../messages/en.json';
import { LoginForm } from '@/components/features/auth/LoginForm';

const mockPush = vi.fn();
const mockRefresh = vi.fn();

vi.mock('@/lib/i18n/navigation', () => ({
  Link: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href as string} {...props}>
      {children}
    </a>
  ),
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}));

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

vi.mock('@/components/features/auth/AdminPasswordForm', () => ({
  AdminPasswordForm: () => <div>Admin password form</div>,
}));

function renderLoginForm(redirectTo?: string, adminMode = false) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <LoginForm redirectTo={redirectTo} adminMode={adminMode} />
    </NextIntlClientProvider>,
  );
}

async function requestOtp(identifier = 'dana@example.com') {
  fireEvent.change(screen.getByLabelText('Your email address'), { target: { value: identifier } });
  fireEvent.click(screen.getByRole('button', { name: 'Send 6-digit code' }));
  await screen.findByLabelText('Enter the code sent to your email');
}

describe('LoginForm', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockRefresh.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('renders Google sign-in when configured without hiding OTP entry', () => {
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_CLIENT_ID', 'test-google-client-id');
    renderLoginForm();

    expect(screen.getByRole('button', { name: 'Send 6-digit code' })).toBeInTheDocument();
    expect(screen.getByText('Sign in with an email code')).toBeInTheDocument();
    expect(screen.getByText(/we'll send you a 6-digit sign-in code/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mock Google button' })).toBeInTheDocument();
    expect(screen.getByText('or sign in with Google')).toBeInTheDocument();
    expect(screen.getByText(/no separate registration is needed/i)).toBeInTheDocument();
    expect(screen.queryByText(/isn't available right now/i)).not.toBeInTheDocument();
  });

  it('still shows OTP login when Google is not configured', () => {
    renderLoginForm();

    expect(screen.getByRole('button', { name: 'Send 6-digit code' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('name@example.com')).toHaveAccessibleDescription(
      "Enter your email address and we'll send you a 6-digit sign-in code.",
    );
    expect(screen.queryByText(/isn't available right now/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mock Google button' })).not.toBeInTheDocument();
  });

  it('does not render OTP UI in admin mode', () => {
    renderLoginForm('/admin', true);
    expect(screen.getByText('Admin password form')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send 6-digit code' })).not.toBeInTheDocument();
  });

  it('shows the error the Google button reports as a banner', () => {
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_CLIENT_ID', 'test-google-client-id');
    renderLoginForm();
    fireEvent.click(screen.getByRole('button', { name: 'Mock Google button' }));
    expect(screen.getByRole('alert')).toHaveTextContent('google failed');
  });

  it('requests an OTP and then shows a masked identifier', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    renderLoginForm();
    await requestOtp('dana@example.com');

    expect(fetchMock).toHaveBeenCalledWith('/api/auth/otp/request', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ identifier: 'dana@example.com' }),
    }));
    expect(screen.getByText(/d\*{3,}@example\.com/)).toBeInTheDocument();
    expect(screen.queryByDisplayValue('dana@example.com')).not.toBeInTheDocument();
  });

  it('maps a request rate-limit to a user-facing error', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { code: 'RATE_LIMITED' } }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    renderLoginForm();
    fireEvent.change(screen.getByLabelText('Your email address'), { target: { value: 'dana@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send 6-digit code' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/too many attempts/i);
    expect(screen.queryByLabelText('Enter the code sent to your email')).not.toBeInTheDocument();
  });

  it('explains an invalid email without sending an OTP request', () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    renderLoginForm();
    fireEvent.change(screen.getByLabelText('Your email address'), { target: { value: 'wrong-address' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send 6-digit code' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid email address.');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('verifies a 6-digit code and refreshes the session without storing tokens', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }));
    renderLoginForm('/account/bookings');
    await requestOtp();
    fireEvent.change(screen.getByLabelText('Enter the code sent to your email'), { target: { value: '135790' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm code' }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/account/bookings'));
    expect(mockRefresh).toHaveBeenCalled();
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/auth/otp/verify', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ identifier: 'dana@example.com', code: '135790' }),
    }));
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain('accessToken');
  });

  it('maps an invalid or expired code without setting a session', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { code: 'OTP_INVALID_OR_EXPIRED' } }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    renderLoginForm();
    await requestOtp();
    fireEvent.change(screen.getByLabelText('Enter the code sent to your email'), { target: { value: '000000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm code' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/invalid or has expired/i);
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it('lets the user change email and return to the request step', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    renderLoginForm();
    await requestOtp();
    fireEvent.click(screen.getByRole('button', { name: 'Change email' }));
    expect(screen.getByRole('button', { name: 'Send 6-digit code' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Enter the code sent to your email')).not.toBeInTheDocument();
  });

  it('disables resend during the client cooldown window', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    renderLoginForm();
    await requestOtp();
    expect(screen.getByRole('button', { name: /resend in 60s/i })).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
