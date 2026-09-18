import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '../messages/en.json';
import { LoginForm } from '@/components/features/auth/LoginForm';

// createNavigation()'s useRouter wraps next/navigation's, which throws
// outside a real Next.js App Router tree. LoginForm only calls
// router.push('/') once, on a successful verify — mocking the module lets
// that call be asserted directly instead of standing up an app router.
const pushMock = vi.fn();
vi.mock('@/lib/i18n/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

function renderLoginForm(redirectTo?: string) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <LoginForm redirectTo={redirectTo} />
    </NextIntlClientProvider>,
  );
}

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function fillIdentifierAndSubmit(value = 'user@example.com') {
  fireEvent.change(screen.getByLabelText(/email or phone number/i), { target: { value } });
  fireEvent.click(screen.getByRole('button', { name: /send code/i }));
}

function typeCode(digits: string) {
  const boxes = screen.getAllByRole('textbox', { name: /digit \d of 6/i });
  digits.split('').forEach((digit, i) => fireEvent.change(boxes[i], { target: { value: digit } }));
}

describe('LoginForm', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    pushMock.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('validates locally and never calls the backend for an empty identifier', () => {
    renderLoginForm();
    fireEvent.click(screen.getByRole('button', { name: /send code/i }));
    expect(screen.getByText(/enter a valid email or phone number/i)).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('shows a loading state while the OTP request is in flight, then advances to the code step', async () => {
    let resolveFetch!: (response: Response) => void;
    (fetch as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      }),
    );

    renderLoginForm();
    fillIdentifierAndSubmit();

    const loadingButton = await screen.findByRole('button', { name: /sending code/i });
    expect(loadingButton).toBeDisabled();
    expect(loadingButton).toHaveAttribute('aria-busy', 'true');

    resolveFetch(new Response(null, { status: 204 }));

    expect(await screen.findByText(/enter your code/i)).toBeInTheDocument();
    expect(screen.getByText(/user@example\.com/)).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      '/api/auth/otp/request',
      expect.objectContaining({ body: JSON.stringify({ identifier: 'user@example.com' }) }),
    );
  });

  it('starts the resend cooldown, disabled, right after a code is sent', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(new Response(null, { status: 204 }));
    renderLoginForm();
    fillIdentifierAndSubmit();

    const resendButton = await screen.findByRole('button', { name: /resend code in \d+s/i });
    expect(resendButton).toBeDisabled();
  });

  it('shows a banner (not a field error) and stays on the identifier step for a 429', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      jsonResponse({ error: { code: 'RATE_LIMITED', message: 'x' } }, 429),
    );
    renderLoginForm();
    fillIdentifierAndSubmit();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/too many requests/i);
    expect(screen.getByRole('button', { name: /send code/i })).toBeInTheDocument();
  });

  it('auto-verifies once all six digits are entered and redirects home on success', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 204 })) // otp/request
      .mockResolvedValueOnce(jsonResponse({ success: true }, 200)); // otp/verify

    renderLoginForm();
    fillIdentifierAndSubmit();
    await screen.findByText(/enter your code/i);

    typeCode('123456');

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/auth/otp/verify',
      expect.objectContaining({
        body: JSON.stringify({ identifier: 'user@example.com', code: '123456' }),
      }),
    );
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/'));
    expect(await screen.findByText(/redirecting/i)).toBeInTheDocument();
  });

  it('redirects to the given redirectTo (e.g. /account/bookings) instead of home when one is provided', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(jsonResponse({ success: true }, 200));

    renderLoginForm('/account/bookings');
    fillIdentifierAndSubmit();
    await screen.findByText(/enter your code/i);
    typeCode('123456');

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/account/bookings'));
  });

  it('shows an inline code error and clears the boxes for retry on an invalid/expired code', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(jsonResponse({ error: { code: 'OTP_INVALID_OR_EXPIRED', message: 'x' } }, 401));

    renderLoginForm();
    fillIdentifierAndSubmit();
    await screen.findByText(/enter your code/i);

    typeCode('000000');

    expect(await screen.findByText(/that code isn't right/i)).toBeInTheDocument();
    const boxes = screen.getAllByRole('textbox', { name: /digit \d of 6/i }) as HTMLInputElement[];
    expect(boxes.every((box) => box.value === '')).toBe(true);
    // Still on the code step — a wrong code doesn't send the person back
    // to re-enter their email/phone.
    expect(screen.getByText(/enter your code/i)).toBeInTheDocument();
  });

  it('shows a banner and suggests a new code after too many incorrect attempts', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(jsonResponse({ error: { code: 'OTP_TOO_MANY_ATTEMPTS', message: 'x' } }, 429));

    renderLoginForm();
    fillIdentifierAndSubmit();
    await screen.findByText(/enter your code/i);
    typeCode('111111');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/too many incorrect attempts/i);
  });

  it('lets the person go back and use a different identifier', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(new Response(null, { status: 204 }));
    renderLoginForm();
    fillIdentifierAndSubmit();
    await screen.findByText(/enter your code/i);

    fireEvent.click(screen.getByRole('button', { name: /use a different email or phone/i }));

    expect(await screen.findByRole('button', { name: /^send code$/i })).toBeInTheDocument();
  });

  it('falls back to a generic error when the request never reaches the network', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('offline'));
    renderLoginForm();
    fillIdentifierAndSubmit();

    expect(await screen.findByText(/something went wrong/i)).toBeInTheDocument();
  });
});
