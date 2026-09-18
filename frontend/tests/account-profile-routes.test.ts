// @vitest-environment node
//
// Route Handler, not React — same rationale as tests/rooms-routes.test.ts.

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

describe('PATCH /api/account/profile', () => {
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

    const { PATCH } = await import('../app/api/account/profile/route');
    const response = await PATCH(
      req('/api/account/profile', { method: 'PATCH', body: JSON.stringify({ displayName: 'New Name' }) }),
    );

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error.code).toBe('UNAUTHENTICATED');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('forwards the bearer token and the request body to PATCH /account/me', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: 'user-1',
          email: 'user@example.com',
          phone: null,
          displayName: 'New Name',
          locale: 'en',
          createdAt: '2026-01-01T00:00:00.000Z',
        }),
        { status: 200 },
      ),
    );

    const { PATCH } = await import('../app/api/account/profile/route');
    const response = await PATCH(
      req('/api/account/profile', {
        method: 'PATCH',
        cookie: `${ACCESS_TOKEN_COOKIE}=test-token`,
        body: JSON.stringify({ displayName: 'New Name', locale: 'en' }),
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.displayName).toBe('New Name');

    const outboundRequest = fetchMock.mock.calls[0][0] as Request;
    expect(outboundRequest.url).toContain('/account/me');
    expect(outboundRequest.method).toBe('PATCH');
    expect(outboundRequest.headers.get('Authorization')).toBe('Bearer test-token');
  });

  it('relays a backend validation error as-is', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: { code: 'VALIDATION_ERROR', message: 'locale must be one of the allowed values' } }),
        { status: 400 },
      ),
    );

    const { PATCH } = await import('../app/api/account/profile/route');
    const response = await PATCH(
      req('/api/account/profile', {
        method: 'PATCH',
        cookie: `${ACCESS_TOKEN_COOKIE}=test-token`,
        body: JSON.stringify({ locale: 'xx' }),
      }),
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });
});
