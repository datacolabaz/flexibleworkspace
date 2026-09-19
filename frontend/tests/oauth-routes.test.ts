// @vitest-environment node
//
// Same shape as auth-routes.test.ts's otp/verify coverage — these two
// routes (app/api/auth/google, app/api/auth/facebook) are the identical
// BFF hand-off, just with a different backend path and request body field.

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

function req(url: string, init?: RequestInit) {
  return new NextRequest(`http://localhost:3000${url}`, init as ConstructorParameters<typeof NextRequest>[1]);
}

describe('BFF OAuth routes', () => {
  beforeEach(() => {
    process.env.BACKEND_API_URL = 'https://backend.test/api/v1';
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    process.env.BACKEND_API_URL = ORIGINAL_ENV;
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  describe('POST /api/auth/google', () => {
    it('sets httpOnly cookies from the token pair and never echoes the tokens in the body', async () => {
      const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ accessToken: 'g-access', refreshToken: 'g-refresh', expiresIn: 900 }, 201),
      );

      const { POST } = await import('../app/api/auth/google/route');
      const response = await POST(
        req('/api/auth/google', { method: 'POST', body: JSON.stringify({ idToken: 'fake-id-token' }) }),
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toEqual({ success: true });
      expect(JSON.stringify(body)).not.toContain('g-access');

      const access = response.cookies.get('spotva_access_token');
      expect(access?.value).toBe('g-access');
      expect(access?.httpOnly).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('rejects a missing idToken before ever calling the backend', async () => {
      const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
      const { POST } = await import('../app/api/auth/google/route');
      const response = await POST(req('/api/auth/google', { method: 'POST', body: JSON.stringify({}) }));

      expect(response.status).toBe(400);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('proxies a 403 (unverified email) and sets no cookies', async () => {
      const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ error: { code: 'OAUTH_EMAIL_NOT_VERIFIED', message: "Your Google account's email is not verified." } }, 403),
      );

      const { POST } = await import('../app/api/auth/google/route');
      const response = await POST(
        req('/api/auth/google', { method: 'POST', body: JSON.stringify({ idToken: 'fake-id-token' }) }),
      );

      expect(response.status).toBe(403);
      expect(response.cookies.getAll()).toHaveLength(0);
      const body = await response.json();
      expect(body.error.code).toBe('OAUTH_EMAIL_NOT_VERIFIED');
    });
  });

  describe('POST /api/auth/facebook', () => {
    it('sets httpOnly cookies from the token pair', async () => {
      const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ accessToken: 'fb-access', refreshToken: 'fb-refresh', expiresIn: 900 }, 201),
      );

      const { POST } = await import('../app/api/auth/facebook/route');
      const response = await POST(
        req('/api/auth/facebook', { method: 'POST', body: JSON.stringify({ accessToken: 'fake-fb-token' }) }),
      );

      expect(response.status).toBe(200);
      const access = response.cookies.get('spotva_access_token');
      expect(access?.value).toBe('fb-access');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('rejects a missing accessToken before ever calling the backend', async () => {
      const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
      const { POST } = await import('../app/api/auth/facebook/route');
      const response = await POST(req('/api/auth/facebook', { method: 'POST', body: JSON.stringify({}) }));

      expect(response.status).toBe(400);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('proxies a 503 when Facebook sign-in is not configured on the backend', async () => {
      const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
      fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }));

      const { POST } = await import('../app/api/auth/facebook/route');
      const response = await POST(
        req('/api/auth/facebook', { method: 'POST', body: JSON.stringify({ accessToken: 'fake-fb-token' }) }),
      );

      expect(response.status).toBe(503);
      expect(response.cookies.getAll()).toHaveLength(0);
    });
  });
});
