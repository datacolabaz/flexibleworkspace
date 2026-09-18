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

describe('POST /api/providers', () => {
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

    const { POST } = await import('../app/api/providers/route');
    const response = await POST(
      req('/api/providers', {
        method: 'POST',
        body: JSON.stringify({ legalName: 'Acme LLC', displayName: 'Acme Spaces' }),
      }),
    );

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error.code).toBe('UNAUTHENTICATED');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('forwards the bearer token and body to POST /providers, returning the created provider', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: 'provider-1',
          legalName: 'Acme LLC',
          displayName: 'Acme Spaces',
          category: 'Coworking',
          verificationStatus: 'PENDING',
        }),
        { status: 201 },
      ),
    );

    const { POST } = await import('../app/api/providers/route');
    const response = await POST(
      req('/api/providers', {
        method: 'POST',
        cookie: `${ACCESS_TOKEN_COOKIE}=test-token`,
        body: JSON.stringify({ legalName: 'Acme LLC', displayName: 'Acme Spaces', category: 'Coworking' }),
      }),
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.id).toBe('provider-1');
    expect(body.verificationStatus).toBe('PENDING');

    const outboundRequest = fetchMock.mock.calls[0][0] as Request;
    expect(outboundRequest.url).toContain('/providers');
    expect(outboundRequest.method).toBe('POST');
    expect(outboundRequest.headers.get('Authorization')).toBe('Bearer test-token');
  });

  it('relays a backend validation error as-is', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: { code: 'VALIDATION_ERROR', message: 'legalName should not be empty' } }),
        { status: 400 },
      ),
    );

    const { POST } = await import('../app/api/providers/route');
    const response = await POST(
      req('/api/providers', {
        method: 'POST',
        cookie: `${ACCESS_TOKEN_COOKIE}=test-token`,
        body: JSON.stringify({ legalName: '', displayName: 'Acme Spaces' }),
      }),
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });
});
