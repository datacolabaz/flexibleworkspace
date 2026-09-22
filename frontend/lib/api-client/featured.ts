import 'server-only';

/**
 * Raw-fetch client for Sprint 4 (Featured Listing)'s public homepage
 * endpoint, same pattern as `leads.ts`/`provider-dashboard.ts` rather
 * than the typed openapi-fetch client in `client.ts`: `spaces/featured`
 * isn't in the approved OpenAPI contract (docs/phase2/29_API_OPENAPI.yaml)
 * yet — adding it there and regenerating `schema.d.ts` is a separate
 * follow-up, not bundled into this feature pass.
 */

export type FeaturedRoom = {
  id: string;
  name: string;
  roomType: string;
  providerName: string;
  verified: boolean;
  city: string;
  district: string | null;
  capacityMin: number;
  capacityMax: number;
  pricePerHour: { amount: number; currency: string };
  averageRating: number;
  reviewCount: number;
  coverPhotoUrl: string | null;
};

function backendUrl(path: string) {
  const baseUrl = process.env.BACKEND_API_URL;
  if (!baseUrl) throw new Error('BACKEND_API_URL is not set.');
  return `${baseUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
}

/**
 * `GET spaces/featured` — public, admin-curated rooms for the homepage's
 * "Featured venues" section. Deliberately best-effort: this is homepage
 * decoration, not critical data, so any failure (backend hiccup, bad
 * response) degrades to an empty list rather than breaking the page —
 * same soft-failure discipline the room detail page already uses for its
 * initial-favorite check.
 */
export async function getFeaturedRooms(limit = 6): Promise<FeaturedRoom[]> {
  try {
    const response = await fetch(backendUrl(`spaces/featured?limit=${limit}`), {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!response.ok) return [];
    return (await response.json()) as FeaturedRoom[];
  } catch (err) {
    console.error('Best-effort featured rooms fetch failed (homepage still renders):', err);
    return [];
  }
}
