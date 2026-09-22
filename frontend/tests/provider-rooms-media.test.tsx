import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ProviderRoomsPanel } from '@/components/features/provider/ProviderRoomsPanel';
import type { MediaCapabilities, MyLocation, MyRoom, RoomTypeOption } from '@/lib/api-client/provider-rooms';

const location: MyLocation = {
  id: 'loc-1',
  providerId: 'provider-1',
  name: 'Main',
  addressLine: 'Addr',
  city: 'Bakı',
  district: null,
  countryCode: 'AZ',
  timezone: 'Asia/Baku',
  lat: 40.3777,
  lng: 49.892,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const roomTypes: RoomTypeOption[] = [{ id: 'rt-1', translationKey: 'room_type.meeting_room' }];

const room: MyRoom = {
  id: 'room-1',
  locationId: 'loc-1',
  roomTypeId: 'rt-1',
  name: 'Room A',
  description: null,
  capacityMin: 1,
  capacityMax: 4,
  basePriceAmount: '5000',
  basePriceCurrency: 'AZN',
  status: 'DRAFT',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const freeCapabilities: MediaCapabilities = {
  directUploadSupported: true,
  maxImageCount: 5,
  videoAllowed: false,
  maxVideoCount: 0,
  maxVideoDurationSeconds: 0,
  maxVideoSizeBytes: 0,
};

function renderPanel(overrides: { rooms?: MyRoom[]; capabilities?: MediaCapabilities } = {}) {
  return render(
    <ProviderRoomsPanel
      initialLocations={[location]}
      initialRooms={overrides.rooms ?? [room]}
      roomTypes={roomTypes}
      mediaCapabilities={overrides.capabilities ?? freeCapabilities}
    />,
  );
}

/**
 * `RoomMediaManager` (Provider Listing Media Specification) — the room
 * media UI fetches its own photo/video list on mount (`GET
 * provider/rooms/:id/media`), so every test seeds a mocked response for
 * that first call before asserting anything the component renders from it.
 */
describe('ProviderRoomsPanel — media manager', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('loads and displays existing photos, marking the cover photo', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          photos: [
            { id: 'p1', url: 'https://cdn.test/p1.jpg', isCover: true, displayOrder: 0 },
            { id: 'p2', url: 'https://cdn.test/p2.jpg', isCover: false, displayOrder: 1 },
          ],
          video: null,
        }),
        { status: 200 },
      ),
    );

    const { container } = renderPanel();

    await waitFor(() => expect(screen.getByText('Üz qabığı')).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith('/api/provider/rooms/room-1/media', { cache: 'no-store' });
    expect(container.querySelectorAll('img')).toHaveLength(2);
  });

  it('uploads a photo via presign -> PUT-to-storage -> confirm when direct upload is supported, then reloads the list', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ photos: [], video: null }), { status: 200 })) // initial load
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ storageKey: 'key-1', uploadUrl: 'https://r2.test/upload', publicUrl: 'https://cdn.test/key-1' }),
          { status: 200 },
        ),
      ) // presign
      .mockResolvedValueOnce(new Response(null, { status: 200 })) // PUT straight to storage
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ id: 'p1', roomId: 'room-1', storageKey: 'key-1', isCover: true, displayOrder: 0, createdAt: '2026-01-01T00:00:00Z' }),
          { status: 200 },
        ),
      ) // confirm
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ photos: [{ id: 'p1', url: 'https://cdn.test/key-1', isCover: true, displayOrder: 0 }], video: null }),
          { status: 200 },
        ),
      ); // reload after confirm

    const { container } = renderPanel();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const file = new File(['x'], 'photo.jpg', { type: 'image/jpeg' });
    const input = container.querySelector('#room-photo-input-room-1') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(5));
    expect(fetchMock.mock.calls[1][0]).toBe('/api/provider/rooms/room-1/media/photos/presign');
    expect(fetchMock.mock.calls[2][0]).toBe('https://r2.test/upload');
    expect((fetchMock.mock.calls[2][1] as RequestInit).method).toBe('PUT');
    expect(fetchMock.mock.calls[3][0]).toBe('/api/provider/rooms/room-1/media/photos');
    expect(fetchMock.mock.calls[4][0]).toBe('/api/provider/rooms/room-1/media');
  });

  it('falls back to the legacy multipart endpoint when direct upload is not supported', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ photos: [], video: null }), { status: 200 })) // initial load
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'p1', roomId: 'room-1', storageKey: 'key-1', isCover: true, displayOrder: 0, createdAt: '2026-01-01T00:00:00Z' }), {
          status: 200,
        }),
      ) // legacy multipart upload
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ photos: [{ id: 'p1', url: 'https://cdn.test/key-1', isCover: true, displayOrder: 0 }], video: null }), {
          status: 200,
        }),
      ); // reload

    const { container } = renderPanel({ capabilities: { ...freeCapabilities, directUploadSupported: false } });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const file = new File(['x'], 'photo.jpg', { type: 'image/jpeg' });
    const input = container.querySelector('#room-photo-input-room-1') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(fetchMock.mock.calls[1][0]).toBe('/api/provider/rooms/room-1/photos');
    expect((fetchMock.mock.calls[1][1] as RequestInit).method).toBe('POST');
    expect((fetchMock.mock.calls[1][1] as RequestInit).body).toBeInstanceOf(FormData);
  });

  it('hides the upload control once the plan photo limit is reached', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    const photos = Array.from({ length: 5 }, (_, i) => ({
      id: `p${i}`,
      url: `https://cdn.test/p${i}.jpg`,
      isCover: i === 0,
      displayOrder: i,
    }));
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ photos, video: null }), { status: 200 }));

    renderPanel();

    expect(await screen.findByText(/Bu plan üzrə maksimum şəkil sayına çatmısınız/)).toBeInTheDocument();
    expect(screen.queryByText('Şəkil əlavə etmək üçün klikləyin və ya bura sürükləyin')).not.toBeInTheDocument();
  });

  it('shows a PRO-locked message for video when the plan does not allow it', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ photos: [], video: null }), { status: 200 }));

    renderPanel();

    expect(await screen.findByText(/yalnız Pro planda mövcuddur/)).toBeInTheDocument();
  });

  it('shows the video player and a remove button when a PRO room already has a video', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          photos: [],
          video: { url: 'https://cdn.test/video.mp4', durationSeconds: 20, sizeBytes: '1000', mimeType: 'video/mp4' },
        }),
        { status: 200 },
      ),
    );

    renderPanel({
      capabilities: { ...freeCapabilities, videoAllowed: true, maxVideoCount: 1, maxVideoDurationSeconds: 30, maxVideoSizeBytes: 20 * 1024 * 1024 },
    });

    expect(await screen.findByRole('button', { name: 'Videonu sil' })).toBeInTheDocument();
  });
});
