import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '../messages/en.json';
import azMessages from '../messages/az.json';
import { BookingForm } from '@/components/features/booking/BookingForm';

vi.mock('@/lib/i18n/navigation', () => ({
  Link: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href as string} {...props}>
      {children}
    </a>
  ),
}));

function renderForm(
  overrides: Partial<React.ComponentProps<typeof BookingForm>> = {},
  locale = 'en',
  localizedMessages = messages,
) {
  return render(
    <NextIntlClientProvider locale={locale} messages={localizedMessages}>
      <BookingForm
        roomId="room-1"
        startAt="2026-01-01T09:00:00.000Z"
        endAt="2026-01-01T10:00:00.000Z"
        pricePerHour={{ amount: 3000, currency: 'AZN' }}
        isAuthenticated={false}
        capacityMin={1}
        capacityMax={10}
        {...overrides}
      />
    </NextIntlClientProvider>,
  );
}

describe('BookingForm', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    // jsdom doesn't implement real navigation — stub `location.assign` so
    // the "redirect to hosted checkout" step is observable without jsdom
    // throwing "Not implemented: navigation".
    // @ts-expect-error -- narrowing window.location for the test double
    delete window.location;
    // @ts-expect-error -- see above
    window.location = { assign: vi.fn() };
  });

  it('shows the estimated subtotal for the selected window (60 min @ 30 AZN/hr)', () => {
    renderForm();
    expect(screen.getByText('30 AZN')).toBeInTheDocument();
  });

  it('shows guest contact fields when signed out, and none when signed in', () => {
    const { unmount } = renderForm({ isAuthenticated: false });
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    unmount();

    renderForm({ isAuthenticated: true });
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument();
  });

  it('uses the generic Azerbaijani Gmail example for the guest email placeholder', () => {
    renderForm({}, 'az', azMessages);

    expect(screen.getByLabelText('E-poçt')).toHaveAttribute('placeholder', 'adınız@gmail.com');
  });

  it('blocks submit with a field error when signed out with no email or phone, and never calls the backend', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    renderForm();

    fireEvent.click(screen.getByRole('button', { name: 'Continue to payment' }));

    expect(await screen.findByText('Enter an email or phone number so we can reach you.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('creates the booking, then the checkout session, then redirects to checkoutUrl', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'booking-1', status: 'PENDING' }), { status: 201 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ checkoutUrl: 'https://checkout.example/session', paymentId: 'payment-1' }), {
          status: 200,
        }),
      );

    renderForm();
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'guest@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue to payment' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[0][0]).toBe('/api/bookings');
    const bookingBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(bookingBody.customer).toEqual({ email: 'guest@example.com' });

    expect(fetchMock.mock.calls[1][0]).toBe('/api/payments');
    const paymentBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(paymentBody).toEqual({ bookingId: 'booking-1', provider: 'EPOINT' });

    await waitFor(() => expect(window.location.assign).toHaveBeenCalledWith('https://checkout.example/session'));
  });

  it('creates a request-based booking without calling the payments endpoint', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 'booking-request-1', status: 'PENDING', mode: 'REQUEST_BASED' }), {
        status: 201,
      }),
    );

    renderForm();
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'guest@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue to payment' }));

    expect(
      await screen.findByText("Your booking request was sent. It is waiting for the provider's confirmation."),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/bookings');
    expect(window.location.assign).not.toHaveBeenCalled();
  });

  it('shows a mapped error banner on SLOT_UNAVAILABLE and never calls the payments endpoint', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: { code: 'SLOT_UNAVAILABLE', message: 'This time slot is no longer available.' } }),
        { status: 409 },
      ),
    );

    renderForm();
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'guest@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue to payment' }));

    expect(
      await screen.findByText('Sorry, this time slot was just booked by someone else. Please choose another time.'),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('omits the customer object entirely when signed in', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'booking-2', status: 'PENDING' }), { status: 201 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ checkoutUrl: 'https://checkout.example/session-2', paymentId: 'payment-2' }), {
          status: 200,
        }),
      );

    renderForm({ isAuthenticated: true });
    fireEvent.click(screen.getByRole('button', { name: 'Continue to payment' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const bookingBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(bookingBody.customer).toBeUndefined();
  });
});
