import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '../messages/en.json';
import { BookingWidget } from '@/components/features/rooms/BookingWidget';

vi.mock('@/lib/i18n/navigation', () => ({
  Link: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href as string} {...props}>
      {children}
    </a>
  ),
}));

function renderWidget() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <BookingWidget
        roomId="room-1"
        pricePerHour={{ amount: 3000, currency: 'AZN' }}
        minBookingMinutes={60}
        maxBookingMinutes={180}
      />
    </NextIntlClientProvider>,
  );
}

describe('BookingWidget', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('shows the price per hour', () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(new Response(JSON.stringify({ slots: [] }), { status: 200 }));
    renderWidget();
    expect(screen.getByText(/30 AZN/)).toBeInTheDocument();
  });

  it('fetches availability for the selected date from the BFF (not the backend directly)', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ slots: [] }), { status: 200 }));

    renderWidget();

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][0]).toContain('/api/rooms/room-1/availability?date=');
  });

  it('shows "no availability" when the date has no open windows', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(new Response(JSON.stringify({ slots: [] }), { status: 200 }));
    renderWidget();
    expect(await screen.findByText('No availability on this date. Try another date.')).toBeInTheDocument();
  });

  it('shows an error state when the availability fetch fails', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(new Response(null, { status: 500 }));
    renderWidget();
    expect(await screen.findByText(`Couldn't load availability. Please try again.`)).toBeInTheDocument();
  });

  it('walks window -> start time -> duration to an enabled "Continue to book" link with the right price and dates', async () => {
    // An hour out from the real "now" — comfortably past the widget's own
    // 10-minute offer buffer (BookingWidget's START_TIME_LEAD_BUFFER_MINUTES,
    // added after a live smoke test found the widget offering the literal
    // earliest-bookable instant as a start time, which normal form-fill
    // time then raced against the backend's own fresh re-validation) — so
    // the window's first start option is still its literal startAt,
    // matching this test's assertions below.
    const windowStart = new Date(Date.now() + 60 * 60_000);
    const windowEnd = new Date(windowStart.getTime() + 3 * 60 * 60_000);
    const firstStartAt = windowStart.toISOString();
    const firstEndAt = new Date(windowStart.getTime() + 60 * 60_000).toISOString();

    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify({ slots: [{ startAt: windowStart.toISOString(), endAt: windowEnd.toISOString() }] }), {
        status: 200,
      }),
    );
    renderWidget();

    // Only a plain label ("Continue to book") is rendered until a full
    // start+duration selection exists — it's a disabled <button>, not a
    // link, so there is nothing to click through yet.
    expect(screen.queryByRole('link', { name: 'Continue to book' })).not.toBeInTheDocument();

    const windowButton = await screen.findByRole('button', { name: /\d{1,2}:\d{2} (AM|PM).*\d{1,2}:\d{2} (AM|PM)/ });
    fireEvent.click(windowButton);

    const startSelect = await screen.findByLabelText('Start time');
    fireEvent.change(startSelect, { target: { value: firstStartAt } });

    const durationSelect = await screen.findByLabelText('Duration');
    fireEvent.change(durationSelect, { target: { value: '60' } });

    // Scoped to the "Estimated total" row — both it and the header price
    // have a bare "30 AZN" text node as a direct child (Testing Library's
    // default text matcher only looks at an element's own direct text
    // nodes, so both match an unscoped query), so this disambiguates by
    // container instead.
    const totalLabel = await screen.findByText('Estimated total');
    const totalRow = totalLabel.closest('div');
    expect(totalRow).not.toBeNull();
    expect(within(totalRow as HTMLElement).getByText('30 AZN')).toBeInTheDocument(); // 60 min @ 30 AZN/hr subtotal
    const bookLink = screen.getByRole('link', { name: 'Continue to book' });
    expect(bookLink).toHaveAttribute(
      'href',
      `/rooms/room-1/book?startAt=${encodeURIComponent(firstStartAt)}&endAt=${encodeURIComponent(firstEndAt)}`,
    );
  });

  it('does not offer the literal earliest-bookable instant as a start time — the first option is padded by the lead buffer', async () => {
    // A window that starts "now" (the AvailabilityService shape for a room
    // with no minimum-notice policy) — offering `startAt` itself as
    // selectable would race the backend's own fresh re-validation the
    // moment any real form-fill time elapses (found live; see the previous
    // test's comment). The first offered start time must instead be at
    // least START_TIME_LEAD_BUFFER_MINUTES (10) out.
    const windowStart = new Date(Date.now());
    const windowEnd = new Date(windowStart.getTime() + 3 * 60 * 60_000);

    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify({ slots: [{ startAt: windowStart.toISOString(), endAt: windowEnd.toISOString() }] }), {
        status: 200,
      }),
    );
    renderWidget();

    const windowButton = await screen.findByRole('button', { name: /\d{1,2}:\d{2} (AM|PM).*\d{1,2}:\d{2} (AM|PM)/ });
    fireEvent.click(windowButton);

    const startSelect = await screen.findByLabelText('Start time');
    const firstRealOption = within(startSelect).getAllByRole('option')[1]; // index 0 is the placeholder
    const offeredMinutesFromWindowStart =
      (new Date(firstRealOption.getAttribute('value') as string).getTime() - windowStart.getTime()) / 60_000;
    expect(offeredMinutesFromWindowStart).toBeGreaterThanOrEqual(10);
  });
});
