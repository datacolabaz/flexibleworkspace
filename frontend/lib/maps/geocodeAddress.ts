/**
 * Forward geocoding for `LocationForm`'s address fields (name/city/address
 * inputs) so the Mapbox pin in `LocationPickerMap` moves itself instead of
 * silently staying wherever it was — a provider flagged that typing a real
 * address had no effect on the map at all. Uses the same public
 * `NEXT_PUBLIC_MAPBOX_TOKEN` (`pk.`) already used to load the map itself
 * (`loadMapbox.ts`) — the Geocoding API accepts that token directly, no
 * extra credential needed. `15_MAPS_ARCHITECTURE.md` §15.1 governs Mapbox
 * usage generally; this is client-side only, called from `LocationForm`
 * after a debounce, never on the homepage.
 *
 * Biased toward Azerbaijan (`country=az`) and Baku (`proximity`) since
 * every current provider location is in Baku — the map picker itself
 * still lets the provider fine-tune/override the result by dragging, so a
 * biased-but-imperfect geocode is never the final word.
 */

const BAKU_PROXIMITY = '49.892,40.3777';

export interface GeocodeResult {
  lat: number;
  lng: number;
  /** The place name Mapbox actually matched, for a confirmation UI if ever needed. */
  placeName: string;
}

export async function geocodeAddress(
  query: string,
  accessToken: string,
  signal?: AbortSignal,
): Promise<GeocodeResult | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;

  const url = new URL(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(trimmed)}.json`);
  url.searchParams.set('access_token', accessToken);
  url.searchParams.set('country', 'az');
  url.searchParams.set('proximity', BAKU_PROXIMITY);
  url.searchParams.set('language', 'az');
  url.searchParams.set('limit', '1');

  const response = await fetch(url.toString(), { signal });
  if (!response.ok) return null;

  const body = (await response.json()) as {
    features?: Array<{ center?: [number, number]; place_name?: string }>;
  };
  const feature = body.features?.[0];
  if (!feature?.center) return null;

  const [lng, lat] = feature.center;
  return { lat, lng, placeName: feature.place_name ?? trimmed };
}
