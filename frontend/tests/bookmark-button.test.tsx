import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '../messages/en.json';
import { BookmarkButton, type BookmarkButtonProps } from '@/components/features/rooms/BookmarkButton';

vi.mock('@/lib/i18n/navigation', () => ({
  Link: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href as string} {...props}>
      {children}
    </a>
  ),
  usePathname: () => '/rooms/room-1',
}));

function renderButton(initiallyFavorited: boolean | null) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <BookmarkButton roomId="room-1" initiallyFavorited={initiallyFavorited} />
    </NextIntlClientProvider>,
  );
}

describe('BookmarkButton', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('shows the SSR-provided initial favorited state without a fetch', () => {
    renderButton(true);
    expect(screen.getByRole('button', { name: 'Remove from favorites' })).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('POSTs to /api/favorites/{roomId} and flips state when adding a favorite', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ favorited: true }), { status: 200 }));

    renderButton(false);
    fireEvent.click(screen.getByRole('button', { name: 'Add to favorites' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Remove from favorites' })).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith('/api/favorites/room-1', { method: 'POST' });
  });

  it('DELETEs to /api/favorites/{roomId} when removing a favorite', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ favorited: false }), { status: 200 }));

    renderButton(true);
    fireEvent.click(screen.getByRole('button', { name: 'Remove from favorites' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Add to favorites' })).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith('/api/favorites/room-1', { method: 'DELETE' });
  });

  it('shows a sign-in prompt instead of failing silently when the BFF returns 401', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: 'UNAUTHENTICATED' } }), { status: 401 }));

    renderButton(null);
    fireEvent.click(screen.getByRole('button', { name: 'Add to favorites' }));

    expect(await screen.findByRole('link', { name: 'Sign in to save' })).toHaveAttribute(
      'href',
      `/login?redirect=${encodeURIComponent('/rooms/room-1')}`,
    );
  });

  // SearchResultsView (search results' RoomListingCard) mounts this button
  // before it knows whether the room is favorited — `initiallyFavorited`
  // starts `false` and flips to `true` only once a background
  // `/api/favorites` check resolves. Room detail and `/account/favorites`
  // (this component's other two callers) never do this — their prop is
  // settled before mount and never changes — so this is specifically
  // guarding the late-arriving-prop case that search results introduced.
  it('adopts a favorited value that arrives after mount, from false to true', () => {
    const { rerender } = render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <BookmarkButton roomId="room-1" initiallyFavorited={false} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole('button', { name: 'Add to favorites' })).toBeInTheDocument();

    rerender(
      <NextIntlClientProvider locale="en" messages={messages}>
        <BookmarkButton roomId="room-1" initiallyFavorited={true} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole('button', { name: 'Remove from favorites' })).toBeInTheDocument();
  });

  it('does not let a late-arriving initiallyFavorited value undo a click the visitor already made', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ favorited: true }), { status: 200 }));

    function Wrapper({ initiallyFavorited }: Pick<BookmarkButtonProps, 'initiallyFavorited'>) {
      return (
        <NextIntlClientProvider locale="en" messages={messages}>
          <BookmarkButton roomId="room-1" initiallyFavorited={initiallyFavorited} />
        </NextIntlClientProvider>
      );
    }

    const { rerender } = render(<Wrapper initiallyFavorited={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add to favorites' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Remove from favorites' })).toBeInTheDocument());

    // The background check resolves after the click, still reporting the
    // pre-click (stale) value — it must not stomp the visitor's toggle.
    rerender(<Wrapper initiallyFavorited={false} />);
    expect(screen.getByRole('button', { name: 'Remove from favorites' })).toBeInTheDocument();
  });
});
