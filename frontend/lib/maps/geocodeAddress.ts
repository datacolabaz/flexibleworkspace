/**
 * Forward and reverse geocoding for `LocationForm`'s address fields and
 * map interactions so the Mapbox pin moves on address input and the
 * address input updates when the pin is dragged/clicked. Uses the same
 * public `NEXT_PUBLIC_MAPBOX_TOKEN` (`pk.`) already used to load the map
 * itself (`loadMapbox.ts`) — the Geocoding API accepts that token directly,
 * no extra credential needed. `15_MAPS_ARCHITECTURE.md` §15.1 governs Mapbox
 * usage generally; these functions are client-side only, called from
 * `LocationForm` after a debounce (forward) or directly on drag end/click
 * (reverse), never on the homepage.
 *
 * Biased toward Azerbaijan (`country=az`) and Baku (`proximity`) since
 * every current provider location is in Baku — the map picker itself
 * still lets the provider fine-tune/override the result by dragging, so a
 * biased-but-imperfect geocode is never the final word.
 *
 * Both functions throw `GeocodeRateLimitedError` on HTTP 429 and
 * `GeocodeHttpError` on other non-OK responses so callers can surface
 * appropriate messages rather than silently treating every failure as
 * "no result found".
 */

const BAKU_PROXIMITY = '49.892,40.3777';

export interface GeocodeResult {
  lat: number;
  lng: number;
  /** The place name Mapbox actually matched, for a confirmation UI if ever needed. */
  placeName: string;
}

/** Thrown when Mapbox returns HTTP 429 (too many requests). */
export class GeocodeRateLimitedError extends Error {
  constructor() {
    super('RATE_LIMITED');
    this.name = 'GeocodeRateLimitedError';
  }
}

/** Thrown when Mapbox returns a non-OK status other than 429. */
export class GeocodeHttpError extends Error {
  constructor(public readonly status: number) {
    super(`HTTP_${status}`);
    this.name = 'GeocodeHttpError';
  }
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
  if (!response.ok) {
    if (response.status === 429) throw new GeocodeRateLimitedError();
    throw new GeocodeHttpError(response.status);
  }

  const body = (await response.json()) as {
    features?: Array<{ center?: [number, number]; place_name?: string }>;
  };
  const feature = body.features?.[0];
  if (!feature?.center) return null;

  const [lng, lat] = feature.center;
  return { lat, lng, placeName: feature.place_name ?? trimmed };
}

/**
 * Reverse geocoding: given a lat/lng from a marker drag or map click,
 * returns the closest address name so `LocationForm` can update its
 * address input automatically. Returns `null` when Mapbox finds no
 * nearby address (e.g. the pin is in a rural area with no address data).
 */
export async function reverseGeocodeCoords(
  lat: number,
  lng: number,
  accessToken: string,
  signal?: AbortSignal,
): Promise<GeocodeResult | null> {
  const url = new URL(`https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json`);
  url.searchParams.set('access_token', accessToken);
  url.searchParams.set('country', 'az');
  url.searchParams.set('language', 'az');
  url.searchParams.set('limit', '1');
  url.searchParams.set('types', 'address,poi,place');

  const response = await fetch(url.toString(), { signal });
  if (!response.ok) {
    if (response.status === 429) throw new GeocodeRateLimitedError();
    throw new GeocodeHttpError(response.status);
  }

  const body = (await response.json()) as {
    features?: Array<{ center?: [number, number]; place_name?: string }>;
  };
  const feature = body.features?.[0];
  if (!feature?.place_name) return null;

  return { lat, lng, placeName: feature.place_name };
}
