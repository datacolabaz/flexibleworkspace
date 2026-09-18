import 'server-only';
import { createApiClient, unwrap, type ApiPaths } from './client';

export type RegisterProviderInput =
  ApiPaths['/providers']['post']['requestBody']['content']['application/json'];
export type Provider = ApiPaths['/providers']['post']['responses']['201']['content']['application/json'];

/**
 * `POST /providers` (`ProvidersController.create`, 09_DOMAIN_MODEL.md
 * §9.2) — self-service provider registration: any signed-in user can
 * register, starting `verificationStatus: PENDING` (an admin verifies
 * later, `admin/providers.e2e-spec.ts` covers that side). Called only
 * from `app/api/providers/route.ts` — `ListYourSpaceForm` is a Client
 * Component and can't read the session cookie itself, same reasoning as
 * every other BFF-backed form in this app.
 */
export async function registerProvider(accessToken: string, input: RegisterProviderInput): Promise<Provider> {
  const client = createApiClient({ accessToken });
  const result = await client.POST('/providers', { body: input });
  return unwrap(result);
}
