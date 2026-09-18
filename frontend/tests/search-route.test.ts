// @vitest-environment node
//
// Route Handler, not React — same reasons as tests/auth-routes.test.ts:
// 'server-only' (pulled in transitively by lib/api-client/rooms.ts) is
// mocked, and this runs in the 'node' environment rather than jsdom.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

const ORIGINAL_ENV = process.env.BACKEND_API_URL;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function req(url: string) {
  return new NextRequest(`http://localhost:3000${url}`);
}

describe('GET /api/search', () => {
  beforeEach(() => {
    process.env.BACKEND_API_URL = 'https://backend.test/api/v1';
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    process.env.BACKEND_API_URL = ORIGINAL_ENV;
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('forwards string, numeric, amenities (comma-split), and sort params to the backend, dropping empties', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(jsonResponse({ results: [], page: 1, pageSize: 20, totalCount: 0 }));

    const { GET } = await import('../app/api/search/route');
    const response = await GET(
      req(
        '/api/search?city=Baku&roomType=room_type.meeting_room&participants=4&priceMax=5000&amenities=amenity.wifi,amenity.projector&sort=price&page=2&pageSize=10&district=',
      ),
    );

    expect(response.status).toBe(200);
    const calledUrl = new URL(fetchMock.mock.calls[0][0].url ?? fetchMock.mock.calls[0][0]);
    expect(calledUrl.searchParams.get('city')).toBe('Baku');
    expect(calledUrl.searchParams.get('roomType')).toBe('room_type.meeting_room');
    expect(calledUrl.searchParams.get('participants')).toBe('4');
    expect(calledUrl.searchParams.get('priceMax')).toBe('5000');
    // openapi-fetch's default array serializer sends repeated `amenities=`
    // params (form-style, explode:true) rather than a single comma-joined
    // value — either form is valid, since the backend's own
    // `search-query.dto.ts` accepts both (`@Transform` handles an array
    // straight through, or splits a joined string).
    expect(calledUrl.searchParams.getAll('amenities')).toEqual(['amenity.wifi', 'amenity.projector']);
    expect(calledUrl.searchParams.get('sort')).toBe('price');
    expect(calledUrl.searchParams.get('page')).toBe('2');
    expect(calledUrl.searchParams.get('pageSize')).toBe('10');
    // An empty `district=` must not become the literal string "" on the
    // outgoing request — dropped entirely, same as an absent param.
    expect(calledUrl.searchParams.has('district')).toBe(false);
  });

  it('rejects a sort value outside the enum rather than forwarding it', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(jsonResponse({ results: [], page: 1, pageSize: 20, totalCount: 0 }));

    const { GET } = await import('../app/api/search/route');
    await GET(req('/api/search?sort=not-a-real-sort'));

    const calledUrl = new URL(fetchMock.mock.calls[0][0].url ?? fetchMock.mock.calls[0][0]);
    expect(calledUrl.searchParams.has('sort')).toBe(false);
  });

  it('passes through a bare GET with no params as a valid "browse everything" search', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(jsonResponse({ results: [], page: 1, pageSize: 20, totalCount: 0 }));

    const { GET } = await import('../app/api/search/route');
    const response = await GET(req('/api/search'));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ results: [], page: 1, pageSize: 20, totalCount: 0 });
  });

  it('returns the backend error envelope and status on failure, never a raw stack trace', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: { code: 'VALIDATION_ERROR', message: 'date must be in YYYY-MM-DD format.' } }, 400),
    );

    const { GET } = await import('../app/api/search/route');
    const response = await GET(req('/api/search?date=not-a-date'));

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('never caches a response — results reflect live availability', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(jsonResponse({ results: [], page: 1, pageSize: 20, totalCount: 0 }));

    const { GET } = await import('../app/api/search/route');
    const response = await GET(req('/api/search'));

    expect(response.headers.get('cache-control')).toBe('no-store');
  });
});
