const BAKU_PROXIMITY = '49.892,40.3777';

export interface GeocodeResult {
  lat: number;
  lng: number;
  placeName: string;
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
export async function geocodeAddress(query: string, accessToken: string, signal?: AbortSignal): Promise<GeocodeResult | null> {
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
    throw new Error(`Mapbox geocoding failed with status ${response.status}.`);
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
