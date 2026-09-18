// @vitest-environment node
//
// Route Handlers, not React — run in 'node', and 'server-only' (pulled
// in transitively by lib/api-client/client.ts and lib/auth/session.ts)
// is mocked for the same reason as tests/api-client.test.ts.

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

function req(url: string, init?: RequestInit & { cookie?: string }) {
  const { cookie, ...rest } = init ?? {};
  const headers = new Headers(rest.headers);
  if (cookie) headers.set('cookie', cookie);
  // NextRequest's own RequestInit type (from Next's bundled fetch types)
  // isn't structurally identical to lib.dom's RequestInit (e.g. `signal`
  // is typed more strictly), so a plain spread doesn't typecheck even
  // though every field we pass is valid at runtime.
  return new NextRequest(`http://localhost:3000${url}`, {
    ...rest,
    headers,
  } as ConstructorParameters<typeof NextRequest>[1]);
}

describe('BFF auth routes', () => {
  beforeEach(() => {
    process.env.BACKEND_API_URL = 'https://backend.test/api/v1';
    vi.stubEnv('NODE_ENV', 'production'); // so cookies are marked Secure, matching real deploys
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    process.env.BACKEND_API_URL = ORIGINAL_ENV;
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  describe('POST /api/auth/otp/request', () => {
    it('returns 204 and touches no cookies on success', async () => {
      const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
      fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

      const { POST } = await import('../app/api/auth/otp/request/route');
      const response = await POST(req('/api/auth/otp/request', {
        method: 'POST',
        body: JSON.stringify({ identifier: 'user@example.com' }),
      }));

      expect(response.status).toBe(204);
      expect(response.cookies.getAll()).toHaveLength(0);
    });

    it('rejects a missing identifier before ever calling the backend', async () => {
      const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
      const { POST } = await import('../app/api/auth/otp/request/route');
      const response = await POST(req('/api/auth/otp/request', { method: 'POST', body: JSON.stringify({}) }));

      expect(response.status).toBe(400);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('passes a backend 429 straight through', async () => {
      const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ error: { code: 'RATE_LIMITED', message: 'Too many requests' } }, 429),
      );

      const { POST } = await import('../app/api/auth/otp/request/route');
      const response = await POST(req('/api/auth/otp/request', {
        method: 'POST',
        body: JSON.stringify({ identifier: 'user@example.com' }),
      }));

      expect(response.status).toBe(429);
      const body = await response.json();
      expect(body.error.code).toBe('RATE_LIMITED');
    });
  });

  describe('POST /api/auth/otp/verify', () => {
    it('sets httpOnly cookies from the token pair and never echoes the tokens in the body', async () => {
      const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ accessToken: 'access-abc', refreshToken: 'refresh-xyz', expiresIn: 900 }),
      );

      const { POST } = await import('../app/api/auth/otp/verify/route');
      const response = await POST(req('/api/auth/otp/verify', {
        method: 'POST',
        body: JSON.stringify({ identifier: 'user@example.com', code: '123456' }),
      }));

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toEqual({ success: true });
      expect(JSON.stringify(body)).not.toContain('access-abc');
      expect(JSON.stringify(body)).not.toContain('refresh-xyz');

      const access = response.cookies.get('spotva_access_token');
      const refresh = response.cookies.get('spotva_refresh_token');
      expect(access?.value).toBe('access-abc');
      expect(access?.httpOnly).toBe(true);
      expect(access?.secure).toBe(true);
      expect(access?.maxAge).toBe(900);
      expect(refresh?.value).toBe('refresh-xyz');
      expect(refresh?.maxAge).toBe(30 * 24 * 60 * 60);
    });

    it('proxies a 401 for a wrong code and sets no cookies', async () => {
      const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ error: { code: 'OTP_INVALID_OR_EXPIRED', message: 'Code is invalid or has expired.' } }, 401),
      );

      const { POST } = await import('../app/api/auth/otp/verify/route');
      const response = await POST(req('/api/auth/otp/verify', {
        method: 'POST',
        body: JSON.stringify({ identifier: 'user@example.com', code: '000000' }),
      }));

      expect(response.status).toBe(401);
      expect(response.cookies.getAll()).toHaveLength(0);
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('returns 401 immediately when there is no refresh cookie, without calling the backend', async () => {
      const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
      const { POST } = await import('../app/api/auth/refresh/route');
      const response = await POST(req('/api/auth/refresh', { method: 'POST' }));

      expect(response.status).toBe(401);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rotates both cookies on success', async () => {
      const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ accessToken: 'new-access', refreshToken: 'new-refresh', expiresIn: 900 }),
      );

      const { POST } = await import('../app/api/auth/refresh/route');
      const response = await POST(req('/api/auth/refresh', {
        method: 'POST',
        cookie: 'spotva_refresh_token=old-refresh',
      }));

      expect(response.status).toBe(200);
      expect(response.cookies.get('spotva_access_token')?.value).toBe('new-access');
      expect(response.cookies.get('spotva_refresh_token')?.value).toBe('new-refresh');
    });

    it('clears both cookies when the backend rejects the refresh token', async () => {
      const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ error: { code: 'INVALID_REFRESH_TOKEN', message: 'Refresh token is invalid or expired.' } }, 401),
      );

      const { POST } = await import('../app/api/auth/refresh/route');
      const response = await POST(req('/api/auth/refresh', {
        method: 'POST',
        cookie: 'spotva_refresh_token=expired-token',
      }));

      expect(response.status).toBe(401);
      expect(response.cookies.get('spotva_access_token')?.value).toBe('');
      expect(response.cookies.get('spotva_refresh_token')?.value).toBe('');
    });
  });

  describe('POST /api/auth/logout', () => {
    it('calls the backend to revoke the refresh token and clears cookies', async () => {
      const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
      fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

      const { POST } = await import('../app/api/auth/logout/route');
      const response = await POST(req('/api/auth/logout', {
        method: 'POST',
        cookie: 'spotva_refresh_token=some-refresh; spotva_access_token=some-access',
      }));

      expect(response.status).toBe(200);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(response.cookies.get('spotva_access_token')?.value).toBe('');
      expect(response.cookies.get('spotva_refresh_token')?.value).toBe('');
    });

    it('still clears cookies (and succeeds) if the backend call fails', async () => {
      const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
      fetchMock.mockRejectedValueOnce(new Error('backend unreachable'));

      const { POST } = await import('../app/api/auth/logout/route');
      const response = await POST(req('/api/auth/logout', {
        method: 'POST',
        cookie: 'spotva_refresh_token=some-refresh',
      }));

      expect(response.status).toBe(200);
      expect(response.cookies.get('spotva_access_token')?.value).toBe('');
      expect(response.cookies.get('spotva_refresh_token')?.value).toBe('');
    });

    it('skips the backend call entirely when there is no refresh cookie', async () => {
      const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
      const { POST } = await import('../app/api/auth/logout/route');
      const response = await POST(req('/api/auth/logout', { method: 'POST' }));

      expect(response.status).toBe(200);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
