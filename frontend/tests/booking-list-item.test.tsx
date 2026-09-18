import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import messages from '../messages/en.json';
import { BookingListItem } from '@/components/features/account/BookingListItem';
import type { AccountBooking } from '@/lib/api-client/account';
import type { RoomDetail } from '@/lib/api-client/rooms';

// BookingListItem is an async Server Component that calls
// next-intl/server's getTranslations directly (needs Next's real request
// context outside the App Router) — mocked the same way
// tests/header.test.tsx mocks it, extended to resolve dot-path namespaces
// ('account.bookings') and nested keys ('statusLabel.CONFIRMED'), since
// this component uses both.
type Dict = Record<string, unknown>;

function resolvePath(dict: Dict, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, part) => (acc as Dict)?.[part], dict);
}

vi.mock('next-intl/server', () => ({
  getTranslations: async (arg: string | { namespace?: string } | undefined) => {
    const namespace = typeof arg === 'string' ? arg : arg?.namespace;
    const base = namespace ? (resolvePath(messages as Dict, namespace) as Dict) : (messages as Dict);
    return (key: string, values?: Record<string, string | number>) => {
      const val = resolvePath(base, key);
      if (typeof val !== 'string') return key;
      return values ? val.replace(/\{(\w+)\}/g, (_, k) => String(values[k] ?? '')) : val;
    };
  },
}));

vi.mock('@/lib/i18n/navigation', () => ({
  Link: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href as string} {...props}>
      {children}
    </a>
  ),
}));

const baseRoom: RoomDetail = {
  id: 'room-1',
  name: 'Nizami Meeting Room A',
  city: 'Baku',
  district: 'Nasimi',
  coverPhotoUrl: 'https://example.com/photo.jpg',
} as RoomDetail;

function makeBooking(overrides: Partial<AccountBooking> = {}): AccountBooking {
  return {
    id: 'booking-1',
    status: 'CONFIRMED',
    currency: 'AZN',
    totalAmount: 6000,
    items: [
      {
        id: 'item-1',
        roomId: 'room-1',
        startAt: '2026-10-01T09:00:00.000Z',
        endAt: '2026-10-01T10:00:00.000Z',
        unitPriceAmount: 3000,
        quantity: 1,
        status: 'CONFIRMED',
      },
    ],
    ...overrides,
  };
}

async function renderItem(booking: AccountBooking, room: RoomDetail | null) {
  const element = await BookingListItem({ booking, room, locale: 'en' });
  return render(element);
}

describe('BookingListItem', () => {
  it('renders the room name/location, date range, status badge, and total', async () => {
    await renderItem(makeBooking(), baseRoom);
    expect(screen.getByRole('link', { name: 'Nizami Meeting Room A' })).toHaveAttribute('href', '/rooms/room-1');
    expect(screen.getByText('Nasimi, Baku')).toBeInTheDocument();
    expect(screen.getByText('Confirmed')).toBeInTheDocument();
    expect(screen.getByText(/60 AZN/)).toBeInTheDocument();
  });

  it('falls back to a generic label when the room lookup failed (deleted/404)', async () => {
    await renderItem(makeBooking(), null);
    expect(screen.getByText('This space is no longer listed')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Nizami Meeting Room A' })).not.toBeInTheDocument();
  });

  it('shows a "Complete payment" link to the non-locale-prefixed /booking/{id}/failed page for a payable status', async () => {
    await renderItem(makeBooking({ status: 'PENDING' }), baseRoom);
    const cta = screen.getByRole('link', { name: 'Complete payment' });
    expect(cta).toHaveAttribute('href', '/booking/booking-1/failed');
  });

  it('does not show a payment CTA for a confirmed booking', async () => {
    await renderItem(makeBooking({ status: 'CONFIRMED' }), baseRoom);
    expect(screen.queryByRole('link', { name: 'Complete payment' })).not.toBeInTheDocument();
  });

  it('shows a "+N more" note when the booking has more than one item', async () => {
    const booking = makeBooking({
      items: [
        ...makeBooking().items!,
        {
          id: 'item-2',
          roomId: 'room-2',
          startAt: '2026-10-01T11:00:00.000Z',
          endAt: '2026-10-01T12:00:00.000Z',
          unitPriceAmount: 3000,
          quantity: 1,
          status: 'CONFIRMED',
        },
      ],
    });
    await renderItem(booking, baseRoom);
    expect(screen.getByText('+1 more space')).toBeInTheDocument();
  });
});
