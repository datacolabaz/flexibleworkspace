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

export type MyRoomAmenity = {
  id: string;
  translationKey: string;
};

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
  /** Loaded relation — always present (empty array, never undefined) since the entity has no @Exclude() on it. */
  amenities: MyRoomAmenity[];
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

/** Provider Listing Media Specification — this provider's plan-tier photo/video limits, plus whether the active storage driver supports direct-to-bucket upload (S3/R2) or only the multipart fallback (local dev). */
export type MediaCapabilities = {
  directUploadSupported: boolean;
  maxImageCount: number;
  videoAllowed: boolean;
  maxVideoCount: number;
  maxVideoDurationSeconds: number;
  maxVideoSizeBytes: number;
};

export type RoomMediaPhoto = {
  id: string;
  url: string;
  isCover: boolean;
  displayOrder: number;
};

export type RoomMediaVideo = {
  url: string;
  durationSeconds: number | null;
  sizeBytes: string | null;
  mimeType: string | null;
};

export type RoomMedia = {
  photos: RoomMediaPhoto[];
  video: RoomMediaVideo | null;
};

export type PresignedMediaUpload = {
  storageKey: string;
  uploadUrl: string;
  publicUrl: string;
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

/** Amenity taxonomy (id + translationKey) — same shape as `RoomTypeOption`, reused as-is rather than declaring a near-identical type. */
export async function listAmenities(accessToken: string): Promise<RoomTypeOption[]> {
  const response = await fetch(backendUrl('provider/rooms/amenities'), {
    headers: authHeaders(accessToken, false),
    cache: 'no-store',
  });
  return jsonOrThrow<RoomTypeOption[]>(response);
}

/** `PATCH provider/rooms/:roomId/amenities` — full-replace on just the amenities relation, unlike the main `update()`/`RoomInputDto` PATCH which nulls out any omitted optional field. */
export async function updateRoomAmenities(accessToken: string, roomId: string, amenityIds: string[]): Promise<MyRoom> {
  const response = await fetch(backendUrl(`provider/rooms/${encodeURIComponent(roomId)}/amenities`), {
    method: 'PATCH',
    headers: authHeaders(accessToken, true),
    body: JSON.stringify({ amenityIds }),
    cache: 'no-store',
  });
  return jsonOrThrow<MyRoom>(response);
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
  amenityIds?: string[];
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
 * `PATCH provider/rooms/:roomId` — full-object update (`RoomInputDto`),
 * so unlike `updateRoomAmenities` this has full-replace semantics on
 * every field it's given: an omitted `amenityIds` leaves the amenities
 * relation untouched (RoomsService.update() only reassigns it `if
 * (dto.amenityIds)`), so this deliberately never sends that key —
 * amenities have their own dedicated editor/endpoint. `description`,
 * `sizeSqm`, and `cancellationPolicy` DO get reset to null when omitted,
 * so callers should always pass the room's current values for anything
 * they aren't intentionally changing.
 */
export async function updateMyRoom(accessToken: string, roomId: string, input: CreateRoomInput): Promise<MyRoom> {
  const response = await fetch(backendUrl(`provider/rooms/${encodeURIComponent(roomId)}`), {
    method: 'PATCH',
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

/** Multipart passthrough, same pattern as `uploadMyVerificationDocument` — the local-dev fallback when direct upload isn't available (see `MediaCapabilities.directUploadSupported`). */
export async function uploadMyRoomPhoto(accessToken: string, roomId: string, formData: FormData): Promise<MyRoomPhoto> {
  const response = await fetch(backendUrl(`provider/rooms/${encodeURIComponent(roomId)}/photos`), {
    method: 'POST',
    headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` },
    body: formData,
    cache: 'no-store',
  });
  return jsonOrThrow<MyRoomPhoto>(response);
}

// -- Media (Provider Listing Media Specification) --------------------------
//
// The direct-upload path is a THREE-step dance, and only the first and
// third steps go through this BFF (and therefore through these
// functions): (1) presign — ask the backend for a signed PUT URL, (2) the
// browser PUTs the file bytes straight to that URL (R2, not this app —
// there is deliberately no server-side function for that step, it has to
// happen client-side with `fetch(uploadUrl, ...)`), (3) confirm — tell
// the backend the upload finished so it can record the metadata.

export async function getMediaCapabilities(accessToken: string): Promise<MediaCapabilities> {
  const response = await fetch(backendUrl('provider/rooms/media/capabilities'), {
    headers: authHeaders(accessToken, false),
    cache: 'no-store',
  });
  return jsonOrThrow<MediaCapabilities>(response);
}

export async function getRoomMedia(accessToken: string, roomId: string): Promise<RoomMedia> {
  const response = await fetch(backendUrl(`provider/rooms/${encodeURIComponent(roomId)}/media`), {
    headers: authHeaders(accessToken, false),
    cache: 'no-store',
  });
  return jsonOrThrow<RoomMedia>(response);
}

export type PresignInput = { originalFilename: string; mimeType: string };

export async function presignRoomPhoto(
  accessToken: string,
  roomId: string,
  input: PresignInput,
): Promise<PresignedMediaUpload> {
  const response = await fetch(
    backendUrl(`provider/rooms/${encodeURIComponent(roomId)}/media/photos/presign`),
    { method: 'POST', headers: authHeaders(accessToken, true), body: JSON.stringify(input), cache: 'no-store' },
  );
  return jsonOrThrow<PresignedMediaUpload>(response);
}

export type ConfirmPhotoInput = { storageKey: string; width?: number; height?: number; isCover?: boolean };

export async function confirmRoomPhoto(
  accessToken: string,
  roomId: string,
  input: ConfirmPhotoInput,
): Promise<MyRoomPhoto> {
  const response = await fetch(backendUrl(`provider/rooms/${encodeURIComponent(roomId)}/media/photos`), {
    method: 'POST',
    headers: authHeaders(accessToken, true),
    body: JSON.stringify(input),
    cache: 'no-store',
  });
  return jsonOrThrow<MyRoomPhoto>(response);
}

export async function removeRoomPhoto(accessToken: string, roomId: string, photoId: string): Promise<RoomMediaPhoto[]> {
  const response = await fetch(
    backendUrl(`provider/rooms/${encodeURIComponent(roomId)}/media/photos/${encodeURIComponent(photoId)}`),
    { method: 'DELETE', headers: authHeaders(accessToken, false), cache: 'no-store' },
  );
  return jsonOrThrow<RoomMediaPhoto[]>(response);
}

export async function reorderRoomPhotos(
  accessToken: string,
  roomId: string,
  photoIds: string[],
): Promise<RoomMediaPhoto[]> {
  const response = await fetch(backendUrl(`provider/rooms/${encodeURIComponent(roomId)}/media/photos/order`), {
    method: 'PUT',
    headers: authHeaders(accessToken, true),
    body: JSON.stringify({ photoIds }),
    cache: 'no-store',
  });
  return jsonOrThrow<RoomMediaPhoto[]>(response);
}

export async function setCoverRoomPhoto(accessToken: string, roomId: string, photoId: string): Promise<RoomMediaPhoto[]> {
  const response = await fetch(
    backendUrl(`provider/rooms/${encodeURIComponent(roomId)}/media/photos/${encodeURIComponent(photoId)}/cover`),
    { method: 'PATCH', headers: authHeaders(accessToken, false), cache: 'no-store' },
  );
  return jsonOrThrow<RoomMediaPhoto[]>(response);
}

export async function presignRoomVideo(
  accessToken: string,
  roomId: string,
  input: PresignInput,
): Promise<PresignedMediaUpload> {
  const response = await fetch(
    backendUrl(`provider/rooms/${encodeURIComponent(roomId)}/media/video/presign`),
    { method: 'POST', headers: authHeaders(accessToken, true), body: JSON.stringify(input), cache: 'no-store' },
  );
  return jsonOrThrow<PresignedMediaUpload>(response);
}

export type ConfirmVideoInput = { storageKey: string; durationSeconds: number; mimeType: string };

export async function confirmRoomVideo(accessToken: string, roomId: string, input: ConfirmVideoInput): Promise<MyRoom> {
  const response = await fetch(backendUrl(`provider/rooms/${encodeURIComponent(roomId)}/media/video`), {
    method: 'POST',
    headers: authHeaders(accessToken, true),
    body: JSON.stringify(input),
    cache: 'no-store',
  });
  return jsonOrThrow<MyRoom>(response);
}

export async function removeRoomVideo(accessToken: string, roomId: string): Promise<MyRoom> {
  const response = await fetch(backendUrl(`provider/rooms/${encodeURIComponent(roomId)}/media/video`), {
    method: 'DELETE',
    headers: authHeaders(accessToken, false),
    cache: 'no-store',
  });
  return jsonOrThrow<MyRoom>(response);
}


// -- Availability rules (weekly opening hours / date-specific overrides) ---
//
// A room has zero bookable time until at least one of these is set — the
// PUT endpoint existed before this pass but nothing could ever read the
// rules back, so no frontend UI could show what was already saved. This
// closes that gap (GET added alongside the existing PUT).

export type AvailabilityRecurrenceType = 'WEEKLY' | 'DATE_SPECIFIC';

export type AvailabilityRule = {
  id: string;
  roomId: string;
  recurrenceType: AvailabilityRecurrenceType;
  /** 0=Sunday..6=Saturday, set when recurrenceType=WEEKLY. */
  dayOfWeek: number | null;
  /** Set when recurrenceType=DATE_SPECIFIC. */
  specificDate: string | null;
  startTime: string;
  endTime: string;
  isOpen: boolean;
  createdAt: string;
};

export type AvailabilityRuleInput = {
  recurrenceType: AvailabilityRecurrenceType;
  dayOfWeek?: number;
  specificDate?: string;
  startTime: string;
  endTime: string;
  isOpen?: boolean;
};

export async function listRoomAvailabilityRules(accessToken: string, roomId: string): Promise<AvailabilityRule[]> {
  const response = await fetch(backendUrl(`provider/rooms/${encodeURIComponent(roomId)}/availability-rules`), {
    headers: authHeaders(accessToken, false),
    cache: 'no-store',
  });
  return jsonOrThrow<AvailabilityRule[]>(response);
}

export async function replaceRoomAvailabilityRules(
  accessToken: string,
  roomId: string,
  rules: AvailabilityRuleInput[],
): Promise<AvailabilityRule[]> {
  const response = await fetch(backendUrl(`provider/rooms/${encodeURIComponent(roomId)}/availability-rules`), {
    method: 'PUT',
    headers: authHeaders(accessToken, true),
    body: JSON.stringify({ rules }),
    cache: 'no-store',
  });
  return jsonOrThrow<AvailabilityRule[]>(response);
}
