import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '../messages/en.json';
import { BookingFailedView } from '@/components/features/booking/BookingFailedView';

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
      <BookingFailedView bookingId="booking-1" />
    </NextIntlClientProvider>,
  );
}

describe('BookingFailedView', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    // @ts-expect-error -- narrowing window.location for the test double
    delete window.location;
    // @ts-expect-error -- see above
    window.location = { assign: vi.fn() };
  });

  it('offers a retry when the booking is still payable, and redirects to the new checkoutUrl', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'booking-1', status: 'PAYMENT_PENDING', items: [{ roomId: 'room-1' }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ checkoutUrl: 'https://checkout.example/retry' }), { status: 200 }));

    renderView();

    const retryButton = await screen.findByRole('button', { name: 'Try payment again' });
    fireEvent.click(retryButton);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const paymentBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(paymentBody).toEqual({ bookingId: 'booking-1', provider: 'EPOINT' });
    await waitFor(() => expect(window.location.assign).toHaveBeenCalledWith('https://checkout.example/retry'));
  });

  it('shows an expired state with a "book again" link to the room when the hold has lapsed', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 'booking-1', status: 'EXPIRED', items: [{ roomId: 'room-1' }] }), { status: 200 }),
    );

    renderView();

    expect(await screen.findByText('This booking has expired')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Book again' });
    expect(link).toHaveAttribute('href', '/rooms/room-1');
  });

  it('shows a "not found" state on a 404', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: 'NOT_FOUND' } }), { status: 404 }));

    renderView();

    expect(await screen.findByText("We couldn't find this booking.")).toBeInTheDocument();
  });
});
