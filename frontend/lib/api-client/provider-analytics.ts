import 'server-only';

/**
 * Raw-fetch client for Provider Analytics, same pattern as `leads.ts`/
 * `provider-rooms.ts`: `provider/analytics` isn't in the approved OpenAPI
 * contract yet, so this uses a plain fetch rather than the typed
 * openapi-fetch client in `client.ts`.
 */

export type ProviderAnalytics = {
  providerId: string;
  periodDays: number;
  views: number;
  requests: number;
  confirmed: number;
  confirmationRate: number | null;
};

export class ProviderAnalyticsApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ProviderAnalyticsApiError';
  }
}

function backendUrl(path: string) {
  const baseUrl = process.env.BACKEND_API_URL;
  if (!baseUrl) throw new Error('BACKEND_API_URL is not set.');
  return `${baseUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
}

async function jsonOrThrow<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => undefined)) as
    | { error?: { code?: string; message?: string } }
    | T
    | undefined;
  if (!response.ok) {
    const error = body as { error?: { code?: string; message?: string } } | undefined;
    throw new ProviderAnalyticsApiError(
      response.status,
      error?.error?.code ?? 'PROVIDER_ANALYTICS_API_ERROR',
      error?.error?.message ?? 'Request failed.',
    );
  }
  return body as T;
}

/** `GET provider/analytics` — the calling provider's own room views, booking requests, and confirmation rate. */
export async function getMyProviderAnalytics(accessToken: string): Promise<ProviderAnalytics> {
  const response = await fetch(backendUrl('provider/analytics'), {
    headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  return jsonOrThrow<ProviderAnalytics>(response);
}
