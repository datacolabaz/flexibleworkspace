import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '../messages/en.json';
import { SearchResultsView } from '@/components/features/search/SearchResultsView';

const replaceMock = vi.fn();
let mockSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
}));

vi.mock('@/lib/i18n/navigation', () => ({
  usePathname: () => '/search',
  useRouter: () => ({ replace: replaceMock }),
  Link: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href as string} {...props}>
      {children}
    </a>
  ),
}));

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <SearchResultsView />
    </NextIntlClientProvider>,
  );
}

const SAMPLE_ROOM = {
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

// SearchResultsView now also fires a background `/api/favorites` check
// (independent of the search query) alongside `/api/search`, so the
// shared fetch mock needs a route-aware default: tests that only care
// about the search response queue it with `mockResolvedValueOnce` (which
// is consumed by the first call — `/api/search`, since that effect is
// declared first in the component and so fires first on mount) and let
// this default handle the second, `/api/favorites`, call.
function defaultFetchImpl(input: RequestInfo | URL) {
  const url = typeof input === 'string' ? input : input.toString();
  if (url.startsWith('/api/favorites')) {
    return Promise.resolve(new Response(JSON.stringify({ roomIds: [] }), { status: 200 }));
  }
  return Promise.resolve(
    new Response(JSON.stringify({ results: [], page: 1, pageSize: 20, totalCount: 0 }), { status: 200 }),
  );
}

describe('SearchResultsView', () => {
  beforeEach(() => {
    replaceMock.mockClear();
    mockSearchParams = new URLSearchParams();
    vi.stubGlobal('fetch', vi.fn(defaultFetchImpl));
  });

  it('fetches from the same-origin /api/search route (not the backend directly)', async () => {
    mockSearchParams = new URLSearchParams('city=Baku');
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ results: [], page: 1, pageSize: 20, totalCount: 0 }), { status: 200 }),
    );

    renderView();

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][0]).toBe('/api/search?city=Baku');
  });

  it('also fetches /api/favorites in the background to learn which results are already favorited', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ results: [SAMPLE_ROOM], page: 1, pageSize: 20, totalCount: 1 }), { status: 200 }),
    );

    renderView();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/favorites', { cache: 'no-store' }));
  });

  it('renders a filled-heart favorite toggle for a result already in /api/favorites', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.startsWith('/api/favorites')) {
        return Promise.resolve(new Response(JSON.stringify({ roomIds: [SAMPLE_ROOM.id] }), { status: 200 }));
      }
      return Promise.resolve(
        new Response(JSON.stringify({ results: [SAMPLE_ROOM], page: 1, pageSize: 20, totalCount: 1 }), {
          status: 200,
        }),
      );
    });

    renderView();

    expect(await screen.findByRole('button', { name: 'Remove from favorites' })).toBeInTheDocument();
  });

  it('shows the empty state when the search returns zero results', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ results: [], page: 1, pageSize: 20, totalCount: 0 }), { status: 200 }),
    );

    renderView();

    expect(await screen.findByText('No spaces match your filters.')).toBeInTheDocument();
  });

  it('renders a card per result and the total count once loaded', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ results: [SAMPLE_ROOM], page: 1, pageSize: 20, totalCount: 1 }), { status: 200 }),
    );

    renderView();

    expect(await screen.findByText('Sunny Meeting Room')).toBeInTheDocument();
    expect(screen.getByText('1 spaces found')).toBeInTheDocument();
  });

  it('shows an error state with a retry button when the fetch fails', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }));

    renderView();

    expect(await screen.findByText('Something went wrong.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('shows pagination controls only when there is more than one page', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ results: [SAMPLE_ROOM], page: 1, pageSize: 1, totalCount: 3 }), { status: 200 }),
    );

    renderView();

    expect(await screen.findByText('Page 1 of 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next' })).not.toBeDisabled();
  });

  it('renders the map placeholder when no Google Maps key is configured (the case in this environment)', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ results: [SAMPLE_ROOM], page: 1, pageSize: 20, totalCount: 1 }), { status: 200 }),
    );

    renderView();

    expect(await screen.findByText(`The map isn't available right now.`)).toBeInTheDocument();
  });
});
