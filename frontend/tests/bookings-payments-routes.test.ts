// @vitest-environment node
//
// Route Handlers, not React — same rationale as tests/rooms-routes.test.ts.

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

describe('BFF booking + payment routes', () => {
  beforeEach(() => {
    process.env.BACKEND_API_URL = 'https://backend.test/api/v1';
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    process.env.BACKEND_API_URL = ORIGINAL_ENV;
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  describe('POST /api/bookings', () => {
    it('proxies to POST /bookings with no session cookie required (guest checkout)', async () => {
      const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'booking-1', status: 'PENDING' }), { status: 201 }),
      );

      const { POST } = await import('../app/api/bookings/route');
      const response = await POST(
        req('/api/bookings', {
          method: 'POST',
          body: JSON.stringify({
            roomId: 'room-1',
            startAt: '2026-01-01T09:00:00.000Z',
            endAt: '2026-01-01T10:00:00.000Z',
            customer: { email: 'guest@example.com' },
          }),
        }),
      );

      expect(response.status).toBe(201);
      expect(await response.json()).toEqual({ id: 'booking-1', status: 'PENDING' });
      const outboundRequest = fetchMock.mock.calls[0][0] as Request;
      expect(outboundRequest.url).toContain('/bookings');
      expect(outboundRequest.headers.get('Authorization')).toBeNull();
    });

    it('forwards the bearer token when signed in', async () => {
      const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'booking-2', status: 'PENDING' }), { status: 201 }),
      );

      const { POST } = await import('../app/api/bookings/route');
      const response = await POST(
        req('/api/bookings', {
          method: 'POST',
          cookie: `${ACCESS_TOKEN_COOKIE}=test-token`,
          body: JSON.stringify({ roomId: 'room-1', startAt: '2026-01-01T09:00:00.000Z', endAt: '2026-01-01T10:00:00.000Z' }),
        }),
      );

      expect(response.status).toBe(201);
      const outboundRequest = fetchMock.mock.calls[0][0] as Request;
      expect(outboundRequest.headers.get('Authorization')).toBe('Bearer test-token');
    });

    it('relays a backend 409 SLOT_UNAVAILABLE as-is', async () => {
      const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
      fetchMock.mockResolvedValueOnce(
        new Response(
          JSON.stringify({ error: { code: 'SLOT_UNAVAILABLE', message: 'This time slot is no longer available.' } }),
          { status: 409 },
        ),
      );

      const { POST } = await import('../app/api/bookings/route');
      const response = await POST(
        req('/api/bookings', {
          method: 'POST',
          body: JSON.stringify({ roomId: 'room-1', startAt: '2026-01-01T09:00:00.000Z', endAt: '2026-01-01T10:00:00.000Z' }),
        }),
      );

      expect(response.status).toBe(409);
      const body = await response.json();
      expect(body.error.code).toBe('SLOT_UNAVAILABLE');
    });

    it('rejects a non-JSON body without calling the backend', async () => {
      const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;

      const { POST } = await import('../app/api/bookings/route');
      const response = await POST(req('/api/bookings', { method: 'POST', body: 'not json' }));

      expect(response.status).toBe(400);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/bookings/[bookingId]', () => {
    it('returns booking detail with no session cookie (guest, opaque id is the gate)', async () => {
      const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'booking-1', status: 'CONFIRMED' }), { status: 200 }),
      );

      const { GET } = await import('../app/api/bookings/[bookingId]/route');
      const response = await GET(req('/api/bookings/booking-1'), { params: Promise.resolve({ bookingId: 'booking-1' }) });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ id: 'booking-1', status: 'CONFIRMED' });
      const outboundRequest = fetchMock.mock.calls[0][0] as Request;
      expect(outboundRequest.headers.get('Authorization')).toBeNull();
    });

    it('relays a backend 404 as-is', async () => {
      const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Booking not found.' } }), { status: 404 }),
      );

      const { GET } = await import('../app/api/bookings/[bookingId]/route');
      const response = await GET(req('/api/bookings/missing'), { params: Promise.resolve({ bookingId: 'missing' }) });

      expect(response.status).toBe(404);
    });
  });

  describe('POST /api/payments', () => {
    it('proxies to POST /payments and returns the checkout session', async () => {
      const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ checkoutUrl: 'https://checkout.example/session', paymentId: 'payment-1' }), {
          status: 200,
        }),
      );

      const { POST } = await import('../app/api/payments/route');
      const response = await POST(
        req('/api/payments', {
          method: 'POST',
          body: JSON.stringify({ bookingId: 'booking-1', provider: 'EPOINT' }),
        }),
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ checkoutUrl: 'https://checkout.example/session', paymentId: 'payment-1' });
      const outboundRequest = fetchMock.mock.calls[0][0] as Request;
      expect(outboundRequest.url).toContain('/payments');
    });

    it('relays a backend 409 BOOKING_NOT_PAYABLE as-is', async () => {
      const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { code: 'BOOKING_NOT_PAYABLE', message: 'This booking cannot be paid.' } }), {
          status: 409,
        }),
      );

      const { POST } = await import('../app/api/payments/route');
      const response = await POST(
        req('/api/payments', { method: 'POST', body: JSON.stringify({ bookingId: 'booking-1', provider: 'EPOINT' }) }),
      );

      expect(response.status).toBe(409);
      const body = await response.json();
      expect(body.error.code).toBe('BOOKING_NOT_PAYABLE');
    });
  });
});
