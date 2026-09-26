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

interface MapboxFeature {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    name?: string;
    name_preferred?: string;
    full_address?: string;
    place_formatted?: string;
    coordinates?: { longitude?: number; latitude?: number };
    context?: {
      place?: { name?: string };
      locality?: { name?: string };
    };
  };
}

export interface ReverseGeocodeResult {
  addressLine: string;
  city: string | null;
  placeName: string;
}

function coordinatesOf(feature: MapboxFeature): [number | undefined, number | undefined] {
  return [feature.properties?.coordinates?.longitude ?? feature.geometry?.coordinates?.[0], feature.properties?.coordinates?.latitude ?? feature.geometry?.coordinates?.[1]];
}

/**
 * Converts a provider-entered Azerbaijani address into a map point. The v6
 * endpoint handles streets and full addresses more consistently than the
 * legacy v5 path. Country and proximity bias keep ambiguous street names in
 * Azerbaijan/Baku while the draggable marker remains the provider's final
 * confirmation.
 */
export async function geocodeAddress(
  query: string,
  accessToken: string,
  signal?: AbortSignal,
): Promise<GeocodeResult | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;

  const url = new URL('https://api.mapbox.com/search/geocode/v6/forward');
  url.searchParams.set('q', trimmed);
  url.searchParams.set('access_token', accessToken);
  url.searchParams.set('country', 'az');
  url.searchParams.set('proximity', BAKU_PROXIMITY);
  url.searchParams.set('language', 'az');
  url.searchParams.set('types', 'address,street,place,locality,neighborhood');
  url.searchParams.set('autocomplete', 'false');
  url.searchParams.set('permanent', 'true');
  url.searchParams.set('limit', '5');

  const response = await fetch(url.toString(), { signal });
  if (!response.ok) {
    if (response.status === 429) throw new GeocodeRateLimitedError();
    throw new GeocodeHttpError(response.status);
  }

  const body = (await response.json()) as { features?: MapboxFeature[] };
  const feature = body.features?.find((candidate) => {
    const [candidateLng, candidateLat] = coordinatesOf(candidate);
    return Number.isFinite(candidateLng) && Number.isFinite(candidateLat);
  });
  if (!feature) return null;

  const [lng, lat] = coordinatesOf(feature);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const name = feature.properties?.full_address ?? [feature.properties?.name_preferred ?? feature.properties?.name, feature.properties?.place_formatted].filter(Boolean).join(', ') ?? trimmed;

  return { lat: lat as number, lng: lng as number, placeName: name || trimmed };
}

/** Updates the address input after a provider drags the marker or clicks the map. */
export async function reverseGeocodeLocation(lat: number, lng: number, accessToken: string, signal?: AbortSignal): Promise<ReverseGeocodeResult | null> {
  const url = new URL('https://api.mapbox.com/search/geocode/v6/reverse');
  url.searchParams.set('longitude', String(lng));
  url.searchParams.set('latitude', String(lat));
  url.searchParams.set('access_token', accessToken);
  url.searchParams.set('country', 'az');
  url.searchParams.set('language', 'az');
  url.searchParams.set('types', 'address,street');
  url.searchParams.set('permanent', 'true');

  const response = await fetch(url.toString(), { signal });
  if (!response.ok) {
    throw new Error(`Mapbox reverse geocoding failed with status ${response.status}.`);
  }

  const body = (await response.json()) as { features?: MapboxFeature[] };
  const feature = body.features?.[0];
  if (!feature?.properties) return null;

  const addressLine = feature.properties.name_preferred ?? feature.properties.name ?? feature.properties.full_address;
  if (!addressLine) return null;

  return {
    addressLine,
    city: feature.properties.context?.place?.name ?? feature.properties.context?.locality?.name ?? null,
    placeName: feature.properties.full_address ?? [addressLine, feature.properties.place_formatted].filter(Boolean).join(', '),
  };
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
