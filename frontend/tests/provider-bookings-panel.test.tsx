import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ProviderBookingsPanel } from '@/components/features/provider/ProviderBookingsPanel';
import type { ProviderBooking } from '@/lib/api-client/provider-bookings';

function makeBooking(overrides: Partial<ProviderBooking> = {}): ProviderBooking {
  return {
    id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    customerUserId: 'customer-1',
    status: 'PENDING',
    mode: 'REQUEST_BASED',
    currency: 'AZN',
    grossAmount: '10000',
    serviceFeeAmount: '0',
    totalAmount: '10000',
    purpose: null,
    participantsCount: 2,
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z',
    confirmedAt: null,
    cancelledAt: null,
    completedAt: null,
    items: [
      {
        id: 'item-1',
        roomId: '11111111-2222-3333-4444-555555555555',
        startAt: '2026-10-01T09:00:00.000Z',
        endAt: '2026-10-01T10:00:00.000Z',
        unitPriceAmount: '10000',
        quantity: 1,
        status: 'PENDING',
      },
    ],
    ...overrides,
  };
}

describe('ProviderBookingsPanel', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('shows accept and reject for a PENDING request and PATCHes accept', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(makeBooking({ status: 'PAYMENT_PENDING' })), { status: 200 }),
    );

    render(<ProviderBookingsPanel initialBookings={[makeBooking()]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Qəbul et' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][0]).toBe(
      '/api/provider/bookings/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/accept',
    );
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'PATCH' });
    expect(await screen.findByText('Ödəniş gözlənilir')).toBeInTheDocument();
  });

  it('does not show accept/reject after the booking is no longer PENDING', () => {
    render(<ProviderBookingsPanel initialBookings={[makeBooking({ status: 'PAYMENT_PENDING' })]} />);
    expect(screen.queryByRole('button', { name: 'Qəbul et' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rədd et' })).not.toBeInTheDocument();
  });
});
