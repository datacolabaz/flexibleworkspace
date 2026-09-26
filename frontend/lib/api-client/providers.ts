import 'server-only';
import { createApiClient, unwrap, type ApiPaths } from './client';

export type RegisterProviderInput =
  ApiPaths['/providers']['post']['requestBody']['content']['application/json'];
export type Provider = ApiPaths['/providers']['post']['responses']['201']['content']['application/json'];

/**
 * `POST /providers` (`ProvidersController.create`, 09_DOMAIN_MODEL.md
 * §9.2) — self-service provider registration: any signed-in user can
 * register, starting active without a document-verification step. Called only
 * from `app/api/providers/route.ts` — `ListYourSpaceForm` is a Client
 * Component and can't read the session cookie itself, same reasoning as
 * every other BFF-backed form in this app.
 */
export async function registerProvider(accessToken: string, input: RegisterProviderInput): Promise<Provider> {
  const client = createApiClient({ accessToken });
  const result = await client.POST('/providers', { body: input });
  return unwrap(result);
}

export class ProviderLogoApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ProviderLogoApiError';
  }
}

function backendUrl(path: string) {
  const baseUrl = process.env.BACKEND_API_URL;
  if (!baseUrl) throw new Error('BACKEND_API_URL is not set.');
  return `${baseUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
}

/**
 * `POST providers/:id/logo` — multipart passthrough. Not part of
 * the typed OpenAPI client above (new endpoint, not yet in
 * `29_API_OPENAPI.yaml`) — a raw fetch instead, matching every other
 * not-yet-contracted provider endpoint in this codebase.
 *
 * Deliberately takes the provider `id` directly (returned by
 * `registerProvider`, right above) rather than resolving "my provider"
 * server-side from the access token's role claims — a token issued
 * before this registration has no PROVIDER_OWNER claim yet (roles are
 * baked in at sign-in/refresh), so this is called as a same-session
 * follow-up to `POST /providers`, ownership checked by `ownerUserId` on
 * the backend instead (see `ProvidersService.setLogo`).
 */
export async function setProviderLogo(accessToken: string, providerId: string, formData: FormData): Promise<Provider> {
  const response = await fetch(backendUrl(`providers/${encodeURIComponent(providerId)}/logo`), {
    method: 'POST',
    headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` },
    body: formData,
    cache: 'no-store',
  });
  const body = (await response.json().catch(() => undefined)) as
    | { error?: { code?: string; message?: string } }
    | Provider
    | undefined;
  if (!response.ok) {
    const error = body as { error?: { code?: string; message?: string } } | undefined;
    throw new ProviderLogoApiError(
      response.status,
      error?.error?.code ?? 'PROVIDER_LOGO_API_ERROR',
      error?.error?.message ?? 'Logo upload failed.',
    );
  }
  return body as Provider;
}
