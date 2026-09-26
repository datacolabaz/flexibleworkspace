import { afterEach, describe, expect, it, vi } from 'vitest';
import { geocodeAddress, reverseGeocodeLocation, GeocodeRateLimitedError } from '@/lib/maps/geocodeAddress';

describe('geocodeAddress', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses Mapbox v6 with Azerbaijan/Baku bias and returns the matched point', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          features: [
            {
              geometry: { type: 'Point', coordinates: [49.8372, 40.4093] },
              properties: {
                name: 'Mətbuat prospekti',
                place_formatted: 'Bakı, Azərbaycan',
                coordinates: { longitude: 49.8372, latitude: 40.4093 },
              },
            },
          ],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(geocodeAddress('Mətbuat prospekti, Bakı, Azərbaycan', 'pk.test')).resolves.toEqual({
      lat: 40.4093,
      lng: 49.8372,
      placeName: 'Mətbuat prospekti, Bakı, Azərbaycan',
    });

    const requestedUrl = new URL(fetchMock.mock.calls[0][0] as string);
    expect(requestedUrl.origin + requestedUrl.pathname).toBe('https://api.mapbox.com/search/geocode/v6/forward');
    expect(requestedUrl.searchParams.get('q')).toBe('Mətbuat prospekti, Bakı, Azərbaycan');
    expect(requestedUrl.searchParams.get('country')).toBe('az');
    expect(requestedUrl.searchParams.get('proximity')).toBe('49.892,40.3777');
    expect(requestedUrl.searchParams.get('autocomplete')).toBe('false');
    expect(requestedUrl.searchParams.get('permanent')).toBe('true');
  });

  it('returns null when Mapbox has no coordinate-bearing result', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ features: [] }), { status: 200 })));

    await expect(geocodeAddress('Naməlum ünvan, Bakı, Azərbaycan', 'pk.test')).resolves.toBeNull();
  });

  it('throws GeocodeRateLimitedError on HTTP 429 so callers can show a specific retry message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 429 })));

    await expect(geocodeAddress('Mətbuat prospekti, Bakı, Azərbaycan', 'pk.test')).rejects.toThrow(GeocodeRateLimitedError);
  });

  it('reverse-geocodes a manually selected pin back into address fields', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          features: [
            {
              properties: {
                name: 'Mətbuat prospekti 25',
                full_address: 'Mətbuat prospekti 25, Bakı, Azərbaycan',
                place_formatted: 'Bakı, Azərbaycan',
                context: { place: { name: 'Bakı' } },
              },
            },
          ],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(reverseGeocodeLocation(40.4093, 49.8372, 'pk.test')).resolves.toEqual({
      addressLine: 'Mətbuat prospekti 25',
      city: 'Bakı',
      placeName: 'Mətbuat prospekti 25, Bakı, Azərbaycan',
    });

    const requestedUrl = new URL(fetchMock.mock.calls[0][0] as string);
    expect(requestedUrl.origin + requestedUrl.pathname).toBe('https://api.mapbox.com/search/geocode/v6/reverse');
    expect(requestedUrl.searchParams.get('latitude')).toBe('40.4093');
    expect(requestedUrl.searchParams.get('longitude')).toBe('49.8372');
    expect(requestedUrl.searchParams.get('permanent')).toBe('true');
  });
});
