import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ProviderBookingsPanel } from '@/components/features/provider/ProviderBookingsPanel';
import type { ProviderBooking } from '@/lib/api-client/provider-bookings';

function makeBooking(overrides: Partial<ProviderBooking> = {}): ProviderBooking {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    customerUserId: 'cust-1',
    status: 'PENDING',
    mode: 'REQUEST_BASED',
    currency: 'AZN',
    grossAmount: '10000',
    serviceFeeAmount: '0',
    totalAmount: '10000',
    purpose: 'Seminar',
    participantsCount: 4,
    holdExpiresAt: '2026-10-01T12:00:00.000Z',
    createdAt: '2026-09-01T12:00:00.000Z',
    updatedAt: '2026-09-01T12:00:00.000Z',
    confirmedAt: null,
    cancelledAt: null,
    completedAt: null,
    items: [
      {
        id: 'item-1',
        roomId: 'room-1',
        startAt: '2026-10-01T09:00:00.000Z',
        endAt: '2026-10-01T11:00:00.000Z',
        unitPriceAmount: '5000',
        quantity: 1,
        status: 'PENDING',
      },
    ],
    customerDisplayName: 'Aysel',
    customerEmail: 'aysel@example.com',
    customerPhone: null,
    roomName: 'Loft A',
    locationName: 'Nizami',
    ...overrides,
  };
}

describe('ProviderBookingsPanel', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('shows accept/reject for a pending request and hides customer phone', () => {
    render(<ProviderBookingsPanel initialBookings={[makeBooking()]} />);
    expect(screen.getByText('Aysel')).toBeInTheDocument();
    expect(screen.getByText('aysel@example.com')).toBeInTheDocument();
    expect(screen.queryByText('Telefon')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Qəbul et' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rədd et' })).toBeInTheDocument();
  });

  it('calls the accept BFF and updates status', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify(makeBooking({ status: 'PAYMENT_PENDING', customerPhone: '+99450' })),
        { status: 200 },
      ),
    );
    render(<ProviderBookingsPanel initialBookings={[makeBooking()]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Qəbul et' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][0]).toBe(
      '/api/provider/bookings/11111111-1111-1111-1111-111111111111/accept',
    );
    expect(await screen.findByText('Ödəniş gözlənilir')).toBeInTheDocument();
  });
});
