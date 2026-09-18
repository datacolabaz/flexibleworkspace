import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '../messages/en.json';
import { RoomListingCard, type RoomSummary } from '@/components/features/rooms/RoomListingCard';

vi.mock('@/lib/i18n/navigation', () => ({
  Link: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href as string} {...props}>
      {children}
    </a>
  ),
  usePathname: () => '/search',
}));

// RoomListingCard now renders BookmarkButton (the favorite toggle), which
// calls fetch on click — stubbed globally so its presence doesn't leave
// every test in this file needing its own fetch mock.
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

function renderCard(room: Partial<RoomSummary>, props: Partial<React.ComponentProps<typeof RoomListingCard>> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <RoomListingCard room={room as RoomSummary} {...props} />
    </NextIntlClientProvider>,
  );
}

const BASE_ROOM: RoomSummary = {
  id: '11111111-1111-1111-1111-111111111111',
  name: 'Sunny Meeting Room',
  roomType: 'room_type.meeting_room',
  providerName: 'Acme Spaces',
  verified: true,
  city: 'Baku',
  district: 'Nasimi',
  lat: 40.38,
  lng: 49.85,
  distanceKm: 2.4,
  capacityMin: 2,
  capacityMax: 8,
  pricePerHour: { amount: 3000, currency: 'AZN' },
  averageRating: 4.7,
  reviewCount: 12,
  coverPhotoUrl: 'https://cdn.example.com/room.jpg',
  available: true,
  relevanceScore: 0.9,
};

describe('RoomListingCard', () => {
  it('renders the room name, translated room type, price, rating, and distance', () => {
    renderCard(BASE_ROOM);
    expect(screen.getByText('Sunny Meeting Room')).toBeInTheDocument();
    expect(screen.getByText('Meeting room')).toBeInTheDocument();
    expect(screen.getByText('4.7')).toBeInTheDocument();
    expect(screen.getByText('(12)')).toBeInTheDocument();
    expect(screen.getByText(/2\.4 km away/)).toBeInTheDocument();
  });

  it('shows the Verified badge only when the room is verified', () => {
    renderCard({ ...BASE_ROOM, verified: true });
    expect(screen.getByText('Verified')).toBeInTheDocument();
  });

  it('hides the Verified badge when the room is not verified', () => {
    renderCard({ ...BASE_ROOM, verified: false });
    expect(screen.queryByText('Verified')).not.toBeInTheDocument();
  });

  it('shows a "New" label instead of a rating when there are no reviews yet', () => {
    renderCard({ ...BASE_ROOM, reviewCount: 0 });
    expect(screen.getByText('New')).toBeInTheDocument();
  });

  it('links to /rooms/{id}', () => {
    renderCard(BASE_ROOM);
    expect(screen.getByRole('link')).toHaveAttribute('href', '/rooms/11111111-1111-1111-1111-111111111111');
  });

  it('falls back to a placeholder when there is no cover photo', () => {
    renderCard({ ...BASE_ROOM, coverPhotoUrl: undefined });
    expect(screen.getByText('No photo')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('renders a favorite toggle reflecting the initiallyFavorited prop, structurally outside any <a> (not nested interactive content)', () => {
    renderCard(BASE_ROOM, { initiallyFavorited: true });
    const heartButton = screen.getByRole('button', { name: 'Remove from favorites' });
    expect(heartButton.closest('a')).toBeNull();
  });

  it('defaults the favorite toggle to unfavorited when initiallyFavorited is omitted', () => {
    renderCard(BASE_ROOM);
    expect(screen.getByRole('button', { name: 'Add to favorites' })).toBeInTheDocument();
  });

  it('still links the photo to /rooms/{id} (a second, aria-hidden link to the same destination as the text link)', () => {
    const { container } = renderCard(BASE_ROOM);
    const allLinks = container.querySelectorAll('a[href]');
    expect(allLinks).toHaveLength(2);
    allLinks.forEach((link) => expect(link).toHaveAttribute('href', '/rooms/11111111-1111-1111-1111-111111111111'));
  });
});
