import 'server-only';
import createClient, { type Middleware } from 'openapi-fetch';
import type { paths, components } from './schema';

/**
 * Typed client generated FROM docs/phase2/29_API_OPENAPI.yaml (ADR-009 —
 * that file is the contract the backend implements against; `schema.d.ts`
 * is this file's own machine-checked reflection of it, regenerated with
 * `npm run generate:api`, never hand-edited). Every call below is typed
 * against the real request/response shapes, so a change to the OpenAPI
 * contract that this client hasn't caught up with is a type error here,
 * not a runtime surprise — the same discipline
 * FRONTEND_IMPLEMENTATION_PLAN.md §4.2 item 6 asked for.
 *
 * `import 'server-only'` makes it a build error to import this file into
 * a Client Component — BACKEND_API_URL and (once the BFF lands) the
 * bearer token both stay server-side only, per the go-ahead's "never
 * expose backend secrets/OAuth secrets to the browser."
 */

export type ApiPaths = paths;
export type ApiComponents = components;
export type ApiErrorBody = components['schemas']['Error'];

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly details?: unknown;

  constructor(status: number, body: ApiErrorBody | undefined) {
    super(body?.error?.message ?? `API request failed with status ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.code = body?.error?.code;
    this.details = body?.error?.details;
  }
}

function backendBaseUrl(): string {
  const url = process.env.BACKEND_API_URL;
  if (!url) {
    throw new Error(
      'BACKEND_API_URL is not set. Copy .env.local.example to .env.local and fill it in.',
    );
  }
  return url;
}

/**
 * Attaches `Authorization: Bearer <token>` when a caller supplies one.
 * The token itself comes from the BFF's httpOnly session cookie (read by
 * the Route Handler / Server Component calling this client) — this
 * middleware never reads cookies itself, it only shapes the header, so
 * the client stays usable both for public (unauthenticated) calls and
 * for authenticated ones.
 */
function authMiddleware(accessToken: string | undefined): Middleware {
  return {
    onRequest({ request }) {
      if (accessToken) {
        request.headers.set('Authorization', `Bearer ${accessToken}`);
      }
      return request;
    },
  };
}

/**
 * Creates a request-scoped client. Server Components/Route Handlers call
 * this per-request (never as a module-level singleton) so a bearer token
 * read from one user's session cookie can never leak into another
 * request — there is no shared mutable client instance to leak from.
 */
export function createApiClient(opts: { accessToken?: string } = {}) {
  const client = createClient<paths>({ baseUrl: backendBaseUrl() });
  client.use(authMiddleware(opts.accessToken));
  return client;
}

/**
 * Unwraps an openapi-fetch result into "return data or throw ApiError",
 * which is what most call sites want instead of checking `.error` by
 * hand each time. Use the raw client directly (`createApiClient().GET(...)`)
 * for the rare call site that needs to branch on error shape itself.
 */
export async function unwrap<T>(
  result: { data?: T; error?: ApiErrorBody; response: Response },
): Promise<T> {
  if (result.error !== undefined || !result.response.ok) {
    throw new ApiError(result.response.status, result.error);
  }
  // openapi-fetch guarantees `data` is present when there's no error on a
  // successful response; this narrows the type for callers.
  return result.data as T;
}
