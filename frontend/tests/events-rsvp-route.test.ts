// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

const ORIGINAL_ENV = process.env.BACKEND_API_URL;

function req(url: string, init?: RequestInit) {
  return new NextRequest(
    `http://localhost:3000${url}`,
    init as ConstructorParameters<typeof NextRequest>[1],
  );
}

describe('POST /api/events/[id]/rsvp', () => {
  beforeEach(() => {
    process.env.BACKEND_API_URL = 'https://backend.test/api/v1';
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    process.env.BACKEND_API_URL = ORIGINAL_ENV;
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('forwards a guest RSVP without Authorization and returns 201', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: 'rsvp-1',
          eventId: 'event-1',
          userId: null,
          name: 'Aysel',
          email: 'aysel@example.com',
          phone: null,
          status: 'confirmed',
          confirmationCode: 'ABC123DEF456',
          createdAt: '2026-09-27T00:00:00.000Z',
        }),
        { status: 201, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const { POST } = await import('../app/api/events/[id]/rsvp/route');
    const response = await POST(
      req('/api/events/event-1/rsvp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Aysel', email: 'aysel@example.com' }),
      }),
      { params: Promise.resolve({ id: 'event-1' }) },
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.confirmationCode).toBe('ABC123DEF456');

    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://backend.test/api/v1/events/event-1/rsvp',
    );
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get('Authorization')).toBeNull();
  });

  it('forwards backend RSVP_NOT_OPEN instead of a generic 502', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: { code: 'RSVP_NOT_OPEN', message: 'RSVP is not open for this event.' },
        }),
        { status: 409, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const { POST } = await import('../app/api/events/[id]/rsvp/route');
    const response = await POST(
      req('/api/events/event-1/rsvp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Aysel', email: 'aysel@example.com' }),
      }),
      { params: Promise.resolve({ id: 'event-1' }) },
    );

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error.code).toBe('RSVP_NOT_OPEN');
  });
});
