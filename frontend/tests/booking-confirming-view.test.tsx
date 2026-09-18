import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '../messages/en.json';
import { BookingConfirmingView } from '@/components/features/booking/BookingConfirmingView';

vi.mock('@/lib/i18n/navigation', () => ({
  Link: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href as string} {...props}>
      {children}
    </a>
  ),
}));

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <BookingConfirmingView bookingId="booking-1" />
    </NextIntlClientProvider>,
  );
}

describe('BookingConfirmingView', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('polls GET /api/bookings/{id} and shows the confirmed state with the total paid', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: 'booking-1',
          status: 'CONFIRMED',
          currency: 'AZN',
          totalAmount: 3300,
          items: [{ startAt: '2026-01-01T09:00:00.000Z', endAt: '2026-01-01T10:00:00.000Z', roomId: 'room-1' }],
        }),
        { status: 200 },
      ),
    );

    renderView();

    expect(await screen.findByText('Booking confirmed!')).toBeInTheDocument();
    expect(screen.getByText('33 AZN')).toBeInTheDocument();
    expect(fetchMock.mock.calls[0][0]).toBe('/api/bookings/booking-1');
  });

  it('shows a "not found" state on a 404', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: 'NOT_FOUND' } }), { status: 404 }));

    renderView();

    expect(
      await screen.findByText("We couldn't find this booking. If you completed a payment, check your email for confirmation."),
    ).toBeInTheDocument();
  });

  it('shows a "not completed" state for a cancelled/expired booking', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 'booking-1', status: 'EXPIRED', items: [] }), { status: 200 }),
    );

    renderView();

    expect(await screen.findByText('Booking not completed')).toBeInTheDocument();
  });

  it('keeps polling while PENDING and flips to confirmed once the webhook catches up', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'booking-1', status: 'PAYMENT_PENDING', items: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'booking-1', status: 'CONFIRMED', items: [] }), { status: 200 }));

    await act(async () => {
      renderView();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Confirming your payment')).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Booking confirmed!')).toBeInTheDocument();
  });
});
