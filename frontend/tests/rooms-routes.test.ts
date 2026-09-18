// @vitest-environment node
//
// Route Handlers, not React — run in 'node', same rationale as
// tests/auth-routes.test.ts (server-only is mocked transitively).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ACCESS_TOKEN_COOKIE } from '../lib/auth/cookies';

vi.mock('server-only', () => ({}));

const ORIGINAL_ENV = process.env.BACKEND_API_URL;

function req(url: string, init?: RequestInit & { cookie?: string }) {
  const { cookie, ...rest } = init ?? {};
  const headers = new Headers(rest.headers);
  if (cookie) headers.set('cookie', cookie);
  return new NextRequest(`http://localhost:3000${url}`, {
    ...rest,
    headers,
  } as ConstructorParameters<typeof NextRequest>[1]);
}

describe('BFF room detail routes', () => {
  beforeEach(() => {
    process.env.BACKEND_API_URL = 'https://backend.test/api/v1';
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    process.env.BACKEND_API_URL = ORIGINAL_ENV;
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  describe('GET /api/rooms/[id]/availability', () => {
    it('proxies to the real GET /spaces/{roomId}/availability?date=... with no auth required', async () => {
      const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ slots: [{ startAt: '2026-01-01T09:00:00Z', endAt: '2026-01-01T12:00:00Z' }] }), {
          status: 200,
        }),
      );

      const { GET } = await import('../app/api/rooms/[id]/availability/route');
      const response = await GET(req('/api/rooms/room-1/availability?date=2026-01-01'), {
        params: Promise.resolve({ id: 'room-1' }),
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.slots).toHaveLength(1);
      // openapi-fetch's auth middleware calls `fetch(request)` with a
      // single `Request` object (not `fetch(url, init)`), so the outbound
      // URL is read off its `.url`, not the raw first arg.
      const outboundRequest = fetchMock.mock.calls[0][0] as Request;
      expect(outboundRequest.url).toContain('/spaces/room-1/availability');
      expect(outboundRequest.url).toContain('date=2026-01-01');
    });

    it('rejects a missing `date` query param without calling the backend', async () => {
      const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;

      const { GET } = await import('../app/api/rooms/[id]/availability/route');
      const response = await GET(req('/api/rooms/room-1/availability'), { params: Promise.resolve({ id: 'room-1' }) });

      expect(response.status).toBe(400);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('/api/favorites/[roomId]', () => {
    it('GET returns 401 with no session cookie, and never calls the backend', async () => {
      const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;

      const { GET } = await import('../app/api/favorites/[roomId]/route');
      const response = await GET(req('/api/favorites/room-1'), { params: Promise.resolve({ roomId: 'room-1' }) });

      expect(response.status).toBe(401);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('GET forwards the bearer token and returns the favorite status when signed in', async () => {
      const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ favorited: true }), { status: 200 }));

      const { GET } = await import('../app/api/favorites/[roomId]/route');
      const response = await GET(req('/api/favorites/room-1', { cookie: `${ACCESS_TOKEN_COOKIE}=test-token` }), {
        params: Promise.resolve({ roomId: 'room-1' }),
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ favorited: true });
      const outboundRequest = fetchMock.mock.calls[0][0] as Request;
      expect(outboundRequest.headers.get('Authorization')).toBe('Bearer test-token');
    });

    it('POST adds a favorite when signed in', async () => {
      const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ favorited: true }), { status: 201 }));

      const { POST } = await import('../app/api/favorites/[roomId]/route');
      const response = await POST(
        req('/api/favorites/room-1', { method: 'POST', cookie: `${ACCESS_TOKEN_COOKIE}=test-token` }),
        { params: Promise.resolve({ roomId: 'room-1' }) },
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ favorited: true });
    });

    it('DELETE removes a favorite when signed in', async () => {
      const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ favorited: false }), { status: 200 }));

      const { DELETE } = await import('../app/api/favorites/[roomId]/route');
      const response = await DELETE(
        req('/api/favorites/room-1', { method: 'DELETE', cookie: `${ACCESS_TOKEN_COOKIE}=test-token` }),
        { params: Promise.resolve({ roomId: 'room-1' }) },
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ favorited: false });
    });

    it('POST returns 401 with no session cookie, and never calls the backend', async () => {
      const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;

      const { POST } = await import('../app/api/favorites/[roomId]/route');
      const response = await POST(req('/api/favorites/room-1', { method: 'POST' }), {
        params: Promise.resolve({ roomId: 'room-1' }),
      });

      expect(response.status).toBe(401);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
