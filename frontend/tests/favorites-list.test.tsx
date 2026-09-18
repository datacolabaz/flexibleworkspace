import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '../messages/en.json';
import { FavoritesList } from '@/components/features/account/FavoritesList';
import type { FavoriteRoomSummary } from '@/lib/api-client/favorites';

vi.mock('@/lib/i18n/navigation', () => ({
  Link: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href as string} {...props}>
      {children}
    </a>
  ),
  usePathname: () => '/account/favorites',
}));

function renderList(favorites: FavoriteRoomSummary[]) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <FavoritesList initialFavorites={favorites} />
    </NextIntlClientProvider>,
  );
}

const ROOM_A: FavoriteRoomSummary = {
  id: 'room-a',
  name: 'Sunny Meeting Room',
  city: 'Baku',
  district: 'Nasimi',
  pricePerHour: { amount: 3000, currency: 'AZN' },
  averageRating: 4.7,
  reviewCount: 12,
  coverPhotoUrl: 'https://cdn.example.com/room-a.jpg',
  favoritedAt: '2026-09-01T00:00:00.000Z',
};

const ROOM_B: FavoriteRoomSummary = {
  id: 'room-b',
  name: 'Downtown Studio',
  city: 'Baku',
  district: 'Yasamal',
  pricePerHour: { amount: 4500, currency: 'AZN' },
  averageRating: 0,
  reviewCount: 0,
  coverPhotoUrl: undefined,
  favoritedAt: '2026-09-02T00:00:00.000Z',
};

describe('FavoritesList', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('renders one card per favorited room, each linking to its room page', () => {
    renderList([ROOM_A, ROOM_B]);
    expect(screen.getByRole('link', { name: 'Sunny Meeting Room' })).toHaveAttribute('href', '/rooms/room-a');
    expect(screen.getByRole('link', { name: 'Downtown Studio' })).toHaveAttribute('href', '/rooms/room-b');
  });

  it('shows the empty state instead of a grid when there are no favorites', () => {
    renderList([]);
    expect(screen.getByText('No favorites yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Find a space' })).toHaveAttribute('href', '/search');
  });

  it('removes a card from the list the moment its heart is unfavorited, without a page reload', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ favorited: false }), { status: 200 }));

    renderList([ROOM_A, ROOM_B]);
    expect(screen.getByRole('link', { name: 'Sunny Meeting Room' })).toBeInTheDocument();

    // Both cards start favorited, so both render a "Remove from
    // favorites" button — index 0 is ROOM_A's (array order is preserved
    // in the grid), the one this test unfavorites.
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove from favorites' })[0]);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/favorites/room-a', { method: 'DELETE' }));
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Sunny Meeting Room' })).not.toBeInTheDocument());
    // The other card is untouched.
    expect(screen.getByRole('link', { name: 'Downtown Studio' })).toBeInTheDocument();
  });

  it('flips into the empty state once the last favorite is removed', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ favorited: false }), { status: 200 }));

    renderList([ROOM_A]);
    fireEvent.click(screen.getByRole('button', { name: 'Remove from favorites' }));

    expect(await screen.findByText('No favorites yet')).toBeInTheDocument();
  });
});
