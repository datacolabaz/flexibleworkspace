import 'server-only';

/**
 * Server-side fetch client for provider booking and payout data (P2 Task 3).
 * Same raw-fetch pattern as provider-dashboard.ts.
 */

export type ProviderBookingStatus =
  | 'DRAFT'
  | 'PENDING'
  | 'PAYMENT_PENDING'
  | 'CONFIRMED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'NO_SHOW'
  | 'REFUND_PENDING'
  | 'REFUNDED'
  | 'REJECTED'
  | 'CANCELLED_BY_USER'
  | 'CANCELLED_BY_PROVIDER';

export type ProviderBookingItem = {
  id: string;
  roomId: string;
  startAt: string;
  endAt: string;
  unitPriceAmount: string;
  quantity: number;
  status: ProviderBookingStatus;
};

export type ProviderBooking = {
  id: string;
  customerUserId: string;
  status: ProviderBookingStatus;
  mode: string;
  currency: string;
  grossAmount: string;
  serviceFeeAmount: string;
  totalAmount: string;
  purpose: string | null;
  participantsCount: number | null;
  createdAt: string;
  updatedAt: string;
  confirmedAt: string | null;
  cancelledAt: string | null;
  completedAt: string | null;
  items: ProviderBookingItem[];
};

export type ProviderPayoutBalance = {
  available: number;
  pending: number;
  inTransit: number;
  paid: number;
  currency: string;
};

export type ProviderPayout = {
  id: string;
  providerId: string | null;
  periodStart: string;
  periodEnd: string;
  grossLedgerTotal: string;
  amount: string;
  currency: string;
  status: string;
  payoutMethod: string;
  bankReference: string | null;
  paidAt: string | null;
  createdAt: string;
};

function backendUrl(path: string) {
  const baseUrl = process.env.BACKEND_API_URL;
  if (!baseUrl) throw new Error('BACKEND_API_URL is not set.');
  return `${baseUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
}

async function jsonOrThrow<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => undefined);
  if (!response.ok) {
    const err = body as { error?: { code?: string; message?: string } } | undefined;
    throw Object.assign(new Error(err?.error?.message ?? 'Request failed'), {
      status: response.status,
      code: err?.error?.code ?? 'API_ERROR',
    });
  }
  return body as T;
}

export async function listProviderBookings(accessToken: string): Promise<ProviderBooking[]> {
  const response = await fetch(backendUrl('provider/bookings'), {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    cache: 'no-store',
  });
  return jsonOrThrow<ProviderBooking[]>(response);
}

export async function getProviderPayoutBalance(accessToken: string): Promise<ProviderPayoutBalance> {
  const response = await fetch(backendUrl('providers/me/payout-balance'), {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    cache: 'no-store',
  });
  return jsonOrThrow<ProviderPayoutBalance>(response);
}

export async function listProviderPayouts(accessToken: string): Promise<ProviderPayout[]> {
  const response = await fetch(backendUrl('providers/me/payouts'), {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    cache: 'no-store',
  });
  return jsonOrThrow<ProviderPayout[]>(response);
}
