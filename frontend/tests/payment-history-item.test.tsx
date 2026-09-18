import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import messages from '../messages/en.json';
import { PaymentHistoryItem } from '@/components/features/account/PaymentHistoryItem';
import type { PaymentHistoryEntry } from '@/lib/api-client/payments';
import type { RoomDetail } from '@/lib/api-client/rooms';

// Same async-Server-Component next-intl/server mock as tests/booking-list-item.test.tsx.
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
} as RoomDetail;

function makePayment(overrides: Partial<PaymentHistoryEntry> = {}): PaymentHistoryEntry {
  return {
    id: 'payment-1',
    bookingId: 'booking-1',
    providerAdapter: 'PAYRIFF',
    status: 'CAPTURED',
    bookingTotalAmount: 10000,
    bookingCurrency: 'AZN',
    bookingStatus: 'CONFIRMED',
    roomId: 'room-1',
    createdAt: '2026-09-01T00:00:00.000Z',
    transactions: [
      {
        id: 'txn-1',
        type: 'CHARGE',
        amount: 10000,
        currency: 'AZN',
        status: 'CAPTURED',
        createdAt: '2026-09-01T00:00:00.000Z',
      },
    ],
    refunds: [],
    ...overrides,
  };
}

async function renderItem(payment: PaymentHistoryEntry, room: RoomDetail | null) {
  const element = await PaymentHistoryItem({ payment, room, locale: 'en' });
  return render(element);
}

describe('PaymentHistoryItem', () => {
  it('renders the room link, status badge, date, and amount', async () => {
    await renderItem(makePayment(), baseRoom);
    expect(screen.getByRole('link', { name: 'Nizami Meeting Room A' })).toHaveAttribute('href', '/rooms/room-1');
    expect(screen.getByText('Paid')).toBeInTheDocument();
    expect(screen.getByText(/100 AZN/)).toBeInTheDocument();
  });

  it('falls back to a generic label when the room lookup failed (deleted/404)', async () => {
    await renderItem(makePayment(), null);
    expect(screen.getByText('This space is no longer listed')).toBeInTheDocument();
  });

  it('shows a "Failed" badge for a failed payment attempt', async () => {
    await renderItem(makePayment({ status: 'FAILED' }), baseRoom);
    expect(screen.getByText('Failed')).toBeInTheDocument();
  });

  it('lists a nested refund with its amount, status, and date', async () => {
    await renderItem(
      makePayment({
        status: 'REFUNDED',
        refunds: [
          {
            id: 'refund-1',
            amount: 10000,
            currency: 'AZN',
            status: 'COMPLETED',
            reason: 'Change of plans',
            createdAt: '2026-09-05T00:00:00.000Z',
          },
        ],
      }),
      baseRoom,
    );
    expect(screen.getByText(/Refund of 100 AZN — Completed/)).toBeInTheDocument();
  });

  it('renders no refund section when there are no refunds', async () => {
    await renderItem(makePayment(), baseRoom);
    expect(screen.queryByText(/Refund of/)).not.toBeInTheDocument();
  });
});
