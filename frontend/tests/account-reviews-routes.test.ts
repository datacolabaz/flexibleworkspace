// @vitest-environment node
//
// Route Handler, not React — same rationale as tests/account-profile-routes.test.ts.

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

describe('POST /api/reviews', () => {
  beforeEach(() => {
    process.env.BACKEND_API_URL = 'https://backend.test/api/v1';
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    process.env.BACKEND_API_URL = ORIGINAL_ENV;
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('returns 401 with no session cookie, never calling the backend', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;

    const { POST } = await import('../app/api/reviews/route');
    const response = await POST(
      req('/api/reviews', {
        method: 'POST',
        body: JSON.stringify({ bookingId: 'booking-1', rating: 5 }),
      }),
    );

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error.code).toBe('UNAUTHENTICATED');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('forwards the bearer token and body to POST /reviews, returning the created review', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: 'review-1',
          bookingId: 'booking-1',
          customerUserId: 'user-1',
          roomId: 'room-1',
          rating: 5,
          text: 'Great space',
          moderationStatus: 'APPROVED',
          createdAt: '2026-09-01T00:00:00.000Z',
        }),
        { status: 201 },
      ),
    );

    const { POST } = await import('../app/api/reviews/route');
    const response = await POST(
      req('/api/reviews', {
        method: 'POST',
        cookie: `${ACCESS_TOKEN_COOKIE}=test-token`,
        body: JSON.stringify({ bookingId: 'booking-1', rating: 5, text: 'Great space' }),
      }),
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.id).toBe('review-1');

    const outboundRequest = fetchMock.mock.calls[0][0] as Request;
    expect(outboundRequest.url).toContain('/reviews');
    expect(outboundRequest.method).toBe('POST');
    expect(outboundRequest.headers.get('Authorization')).toBe('Bearer test-token');
  });

  it('relays a backend conflict (already reviewed) error as-is', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: { code: 'REVIEW_ALREADY_EXISTS', message: 'This booking has already been reviewed.' } }),
        { status: 409 },
      ),
    );

    const { POST } = await import('../app/api/reviews/route');
    const response = await POST(
      req('/api/reviews', {
        method: 'POST',
        cookie: `${ACCESS_TOKEN_COOKIE}=test-token`,
        body: JSON.stringify({ bookingId: 'booking-1', rating: 4 }),
      }),
    );

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error.code).toBe('REVIEW_ALREADY_EXISTS');
  });
});
