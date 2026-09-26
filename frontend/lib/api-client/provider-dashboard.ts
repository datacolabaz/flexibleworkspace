import 'server-only';

/**
 * Raw-fetch client for the provider self-service dashboard (`/provider`).
 */

export type MyProviderVerificationStatus = 'PENDING' | 'VERIFIED' | 'REJECTED' | 'SUSPENDED';

export type MyProviderPlanTier = 'FREE' | 'STARTER' | 'PRO' | 'ENTERPRISE';

export type MyProvider = {
  id: string;
  legalName: string;
  displayName: string;
  slug: string;
  category: string | null;
  verificationStatus: MyProviderVerificationStatus;
  planTier: MyProviderPlanTier;
  createdAt: string;
};

export class ProviderApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ProviderApiError';
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
    throw new ProviderApiError(
      response.status,
      error?.error?.code ?? 'PROVIDER_API_ERROR',
      error?.error?.message ?? 'Provider request failed.',
    );
  }
  return body as T;
}

/** `GET providers/me` — the caller's own provider profile, or 403 NOT_A_PROVIDER if they never registered one. */
export async function getMyProvider(accessToken: string): Promise<MyProvider> {
  const response = await fetch(backendUrl('providers/me'), {
    headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  return jsonOrThrow<MyProvider>(response);
}
