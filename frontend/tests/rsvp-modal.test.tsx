import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '../messages/en.json';
import { RsvpModal } from '@/components/features/events/RsvpModal';

vi.mock('@/lib/analytics/track', () => ({
  track: vi.fn(),
  AnalyticsEvent: { EventRsvpStarted: 'event_rsvp_started', EventRsvpCompleted: 'event_rsvp_completed' },
}));

function renderModal() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <RsvpModal eventId="event-1" onClose={() => undefined} />
    </NextIntlClientProvider>,
  );
}

describe('RsvpModal success QR', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders a QR image encoding the confirmation code after a successful RSVP', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ confirmationCode: '38F7A2C17DE0' }),
        { status: 201, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    renderModal();
    expect(screen.getByRole('heading', { name: 'Event registration' })).toBeInTheDocument();
    const [nameInput, emailInput] = screen.getAllByRole('textbox');
    fireEvent.change(nameInput, { target: { value: 'Aysel' } });
    fireEvent.change(emailInput, { target: { value: 'aysel@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /confirm attendance/i }));

    await waitFor(() => {
      expect(screen.getByText('Your attendance is confirmed.')).toBeInTheDocument();
    });
    expect(screen.getByText('A confirmation was sent to aysel@example.com.')).toBeInTheDocument();

    const img = screen.getByAltText('Entry QR code') as HTMLImageElement;
    expect(img.src).toContain('api.qrserver.com');
    expect(img.src).toContain(encodeURIComponent('38F7A2C17DE0'));
    expect(img.width).toBe(200);
    expect(
      screen.getByText(
        'Your QR entry code was created. Show this code at the door on the event day.',
      ),
    ).toBeInTheDocument();
  });
});
