// @vitest-environment node
//
// Runs in the 'node' environment, not the project default 'jsdom' —
// `server-only` (imported by lib/api-client/*) throws as soon as
// `window` exists, and jsdom defines one. This is the real, intended
// guard (it's what stops these modules from ever reaching a browser
// bundle), so the fix is to test them in a server-like environment
// rather than to weaken the guard.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Next's webpack build resolves 'server-only' to a no-op when bundling
// for the server (the "react-server" package.json export condition) and
// to a throwing stub when bundling for the client — that's the real
// guard against these modules reaching a browser bundle. Vitest doesn't
// do that conditional resolution, so it would hit the throwing stub
// unconditionally; mocking it here reproduces the "server" resolution
// for this test file, which is testing server-only code by design.
vi.mock('server-only', () => ({}));

const ORIGINAL_ENV = process.env.BACKEND_API_URL;

describe('api-client', () => {
  beforeEach(() => {
    process.env.BACKEND_API_URL = 'https://backend.test/api/v1';
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    process.env.BACKEND_API_URL = ORIGINAL_ENV;
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('throws a clear error when BACKEND_API_URL is missing', async () => {
    delete process.env.BACKEND_API_URL;
    const { createApiClient } = await import('../lib/api-client/client');
    expect(() => createApiClient()).toThrow(/BACKEND_API_URL is not set/);
  });

  it('searchRooms sends typed query params to the right path', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ results: [], page: 1, pageSize: 20, totalCount: 0 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const { searchRooms } = await import('../lib/api-client/rooms');
    const result = await searchRooms({ city: 'Baku', roomType: 'meeting-room', participants: 4 });

    expect(result).toEqual({ results: [], page: 1, pageSize: 20, totalCount: 0 });
    const calledUrl = new URL(fetchMock.mock.calls[0][0].url ?? fetchMock.mock.calls[0][0]);
    expect(calledUrl.origin + calledUrl.pathname).toBe('https://backend.test/api/v1/spaces');
    expect(calledUrl.searchParams.get('city')).toBe('Baku');
    expect(calledUrl.searchParams.get('participants')).toBe('4');
  });

  it('attaches a bearer token when the client is created with an accessToken', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ results: [], page: 1, pageSize: 20, totalCount: 0 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const { createApiClient, unwrap } = await import('../lib/api-client/client');
    const client = createApiClient({ accessToken: 'test-token-123' });
    const result = await client.GET('/spaces', { params: { query: {} } });
    await unwrap(result);

    const requestArg = fetchMock.mock.calls[0][0];
    const headers = requestArg instanceof Request ? requestArg.headers : new Headers();
    expect(headers.get('authorization')).toBe('Bearer test-token-123');
  });

  it('unwraps a 404 into an ApiError carrying the backend error code', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { code: 'ROOM_NOT_FOUND', message: 'No such room' } }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const { getRoomDetail } = await import('../lib/api-client/rooms');
    const { ApiError } = await import('../lib/api-client/client');

    const failure = getRoomDetail('11111111-1111-1111-1111-111111111111');
    await expect(failure).rejects.toBeInstanceOf(ApiError);
    await expect(failure).rejects.toMatchObject({ status: 404, code: 'ROOM_NOT_FOUND' });
  });
});
