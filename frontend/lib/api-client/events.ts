import 'server-only';

// Same env var as every other api-client in this project.
const BACKEND = process.env.BACKEND_API_URL ?? 'http://localhost:3001/api/v1';

function authHeaders(accessToken?: string) {
  return {
    'Content-Type': 'application/json',
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  };
}

interface ApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;
}

interface BackendErrorBody {
  error?: { message?: string; code?: string; details?: unknown };
}

async function fetchJson<T>(url: string, init: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = {};
    }
    const err = (body as BackendErrorBody)?.error ?? {};
    const e = new Error(err.message ?? `HTTP ${res.status}`) as ApiError;
    e.status = res.status;
    e.code = err.code;
    e.details = err.details;
    throw e;
  }
  if (res.status === 204) return undefined as unknown as T;
  return res.json() as Promise<T>;
}

// ── Types ─────────────────────────────────────────────────────────────────

export type EventFormat =
  | 'workshop' | 'telim' | 'seminar' | 'gorusme' | 'networking'
  | 'panel' | 'podkast' | 'foto_video' | 'diger';

export type EventStatus =
  | 'draft' | 'venue_pending' | 'published' | 'rsvp_open'
  | 'sold_out' | 'completed' | 'cancelled' | 'archived';

export type EventVisibility = 'public' | 'private';

export interface EventLocationRecord {
  id: string;
  eventId: string;
  locationId: string | null;
  bookingId: string | null;
  startAt: string | null;
  endAt: string | null;
  status: 'pending' | 'confirmed' | 'cancelled';
}

export interface EventRecord {
  id: string;
  organizerId: string;
  title: string;
  slug: string;
  format: EventFormat;
  shortDescription: string;
  description: string;
  coverImage: string | null;
  language: string;
  capacity: number | null;
  visibility: EventVisibility;
  status: EventStatus;
  startAt: string;
  endAt: string;
  rsvpDeadline: string | null;
  doorsOpenAt: string | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  cancelledAt: string | null;
  deletedAt: string | null;
  eventLocations?: EventLocationRecord[];
  rsvpCount?: number;
}

export interface RsvpRecord {
  id: string;
  eventId: string;
  userId: string | null;
  name: string;
  email: string;
  phone: string | null;
  status: string;
  confirmationCode: string;
  createdAt: string;
}

export interface CreateEventBody {
  title: string;
  format: EventFormat;
  shortDescription: string;
  description: string;
  coverImage?: string;
  language?: string;
  capacity?: number;
  visibility?: EventVisibility;
  startAt: string;
  endAt: string;
  rsvpDeadline?: string;
  doorsOpenAt?: string;
}

export interface CreateRsvpBody {
  name: string;
  email: string;
  phone?: string;
}

export interface LinkVenueBody {
  locationId: string;
  bookingId?: string;
  startAt?: string;
  endAt?: string;
}

// ── API functions ─────────────────────────────────────────────────────────

export function createEvent(body: CreateEventBody, accessToken: string) {
  return fetchJson<EventRecord>(`${BACKEND}/events`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify(body),
    cache: 'no-store',
  });
}

export function updateEvent(id: string, body: Partial<CreateEventBody>, accessToken: string) {
  return fetchJson<EventRecord>(`${BACKEND}/events/${id}`, {
    method: 'PATCH',
    headers: authHeaders(accessToken),
    body: JSON.stringify(body),
    cache: 'no-store',
  });
}

export function publishEvent(id: string, accessToken: string) {
  return fetchJson<EventRecord>(`${BACKEND}/events/${id}/publish`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    cache: 'no-store',
  });
}

export function getPublicEvent(slug: string) {
  return fetchJson<EventRecord & { rsvpCount: number }>(`${BACKEND}/events/${slug}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    next: { revalidate: 30 },
  });
}

export function listPublicEvents(params?: { format?: string; limit?: number; offset?: number }) {
  const qs = new URLSearchParams();
  if (params?.format) qs.set('format', params.format);
  if (params?.limit !== undefined) qs.set('limit', String(params.limit));
  if (params?.offset !== undefined) qs.set('offset', String(params.offset));
  const url = `${BACKEND}/events${qs.toString() ? `?${qs}` : ''}`;
  return fetchJson<{ items: EventRecord[]; total: number }>(url, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    next: { revalidate: 30 },
  });
}

export function getMyEvents(accessToken: string) {
  return fetchJson<(EventRecord & { rsvpCount: number })[]>(`${BACKEND}/events/me`, {
    method: 'GET',
    headers: authHeaders(accessToken),
    cache: 'no-store',
  });
}

export function createRsvp(eventId: string, body: CreateRsvpBody, accessToken?: string) {
  return fetchJson<RsvpRecord>(`${BACKEND}/events/${eventId}/rsvp`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify(body),
    cache: 'no-store',
  });
}

export function linkVenue(eventId: string, body: LinkVenueBody, accessToken: string) {
  return fetchJson<EventLocationRecord>(`${BACKEND}/events/${eventId}/venue`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify(body),
    cache: 'no-store',
  });
}
