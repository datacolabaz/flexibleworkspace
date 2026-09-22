import 'server-only';

/**
 * Raw-fetch client for provider self-service room creation, same
 * pattern as `provider-dashboard.ts`/`leads.ts` rather than the typed
 * openapi-fetch client in `client.ts`: none of `provider/locations`,
 * `provider/rooms`, `provider/rooms/:id/photos`, or `provider/rooms/types`
 * are in the approved OpenAPI contract (docs/phase2/29_API_OPENAPI.yaml)
 * yet — adding them there and regenerating `schema.d.ts` is a separate
 * follow-up, not bundled into this feature pass.
 *
 * A room requires a `locationId` (backend FK, `RoomInputDto`), and a
 * newly-registered provider has zero locations — `POST providers`
 * (self-registration) never creates one. So "add a room" is really two
 * steps: ensure a location exists (create one on first use, defaulting
 * lat/lng to central Baku since there's no geocoding in this codebase —
 * confirmed with the product owner), then create the room itself.
 */

export type MyLocation = {
  id: string;
  providerId: string;
  name: string;
  addressLine: string;
  city: string;
  district: string | null;
  countryCode: string;
  timezone: string;
  lat: number;
  lng: number;
  createdAt: string;
  updatedAt: string;
};

export type RoomTypeOption = {
  id: string;
  translationKey: string;
};

export type MyRoomStatus = 'DRAFT' | 'ACTIVE' | 'INACTIVE';

export type MyRoom = {
  id: string;
  locationId: string;
  roomTypeId: string;
  name: string;
  description: string | null;
  capacityMin: number;
  capacityMax: number;
  basePriceAmount: string;
  basePriceCurrency: string;
  status: MyRoomStatus;
  createdAt: string;
  updatedAt: string;
};

export type MyRoomPhoto = {
  id: string;
  roomId: string;
  storageKey: string;
  isCover: boolean;
  displayOrder: number;
  createdAt: string;
};

/** Baku city-center coordinates — used as every new location's default lat/lng (no geocoding tool in this codebase; admin can correct later). */
export const DEFAULT_LOCATION_LAT = 40.3777;
export const DEFAULT_LOCATION_LNG = 49.892;

export class ProviderRoomsApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ProviderRoomsApiError';
  }
}

function backendUrl(path: string) {
  const baseUrl = process.env.BACKEND_API_URL;
  if (!baseUrl) throw new Error('BACKEND_API_URL is not set.');
  return `${baseUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
}

async function jsonOrThrow<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => undefined)) as
    | { error?: { code?: string; message?: string } }
    | T
    | undefined;
  if (!response.ok) {
    const error = body as { error?: { code?: string; message?: string } } | undefined;
    throw new ProviderRoomsApiError(
      response.status,
      error?.error?.code ?? 'PROVIDER_ROOMS_API_ERROR',
      error?.error?.message ?? 'Request failed.',
    );
  }
  return body as T;
}

function authHeaders(accessToken: string, hasBody: boolean) {
  return {
    Accept: 'application/json',
    ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
    Authorization: `Bearer ${accessToken}`,
  };
}

export async function listMyLocations(accessToken: string): Promise<MyLocation[]> {
  const response = await fetch(backendUrl('provider/locations'), {
    headers: authHeaders(accessToken, false),
    cache: 'no-store',
  });
  return jsonOrThrow<MyLocation[]>(response);
}

export type CreateLocationInput = {
  name: string;
  addressLine: string;
  city: string;
  district?: string;
  lat: number;
  lng: number;
};

export async function createMyLocation(accessToken: string, input: CreateLocationInput): Promise<MyLocation> {
  const response = await fetch(backendUrl('provider/locations'), {
    method: 'POST',
    headers: authHeaders(accessToken, true),
    body: JSON.stringify(input),
    cache: 'no-store',
  });
  return jsonOrThrow<MyLocation>(response);
}

export async function listRoomTypes(accessToken: string): Promise<RoomTypeOption[]> {
  const response = await fetch(backendUrl('provider/rooms/types'), {
    headers: authHeaders(accessToken, false),
    cache: 'no-store',
  });
  return jsonOrThrow<RoomTypeOption[]>(response);
}

export async function listMyRooms(accessToken: string): Promise<MyRoom[]> {
  const response = await fetch(backendUrl('provider/rooms'), {
    headers: authHeaders(accessToken, false),
    cache: 'no-store',
  });
  return jsonOrThrow<MyRoom[]>(response);
}

export type CreateRoomInput = {
  locationId: string;
  roomTypeId: string;
  name: string;
  description?: string;
  capacityMin?: number;
  capacityMax: number;
  basePriceAmount: number;
  basePriceCurrency?: string;
};

export async function createMyRoom(accessToken: string, input: CreateRoomInput): Promise<MyRoom> {
  const response = await fetch(backendUrl('provider/rooms'), {
    method: 'POST',
    headers: authHeaders(accessToken, true),
    body: JSON.stringify(input),
    cache: 'no-store',
  });
  return jsonOrThrow<MyRoom>(response);
}

/**
 * `PATCH provider/rooms/:roomId/status` — DRAFT->ACTIVE additionally
 * requires the provider account to be VERIFIED (backend gate); the BFF
 * route just passes the resulting `PROVIDER_NOT_VERIFIED` error through
 * so the form can show a friendly message pointing back at the
 * verification panel.
 */
export async function setMyRoomStatus(accessToken: string, roomId: string, status: MyRoomStatus): Promise<MyRoom> {
  const response = await fetch(backendUrl(`provider/rooms/${encodeURIComponent(roomId)}/status`), {
    method: 'PATCH',
    headers: authHeaders(accessToken, true),
    body: JSON.stringify({ status }),
    cache: 'no-store',
  });
  return jsonOrThrow<MyRoom>(response);
}

/** Multipart passthrough, same pattern as `uploadMyVerificationDocument`. */
export async function uploadMyRoomPhoto(accessToken: string, roomId: string, formData: FormData): Promise<MyRoomPhoto> {
  const response = await fetch(backendUrl(`provider/rooms/${encodeURIComponent(roomId)}/photos`), {
    method: 'POST',
    headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` },
    body: formData,
    cache: 'no-store',
  });
  return jsonOrThrow<MyRoomPhoto>(response);
}
