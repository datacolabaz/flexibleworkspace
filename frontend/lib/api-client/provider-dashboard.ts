import 'server-only';

/**
 * Raw-fetch client for the provider-side verification dashboard
 * (`/provider`), same pattern as `admin.ts` rather than the typed
 * openapi-fetch client in `client.ts`: `providers/me` (PATCH) and
 * `providers/me/verification-documents` (POST, multipart) aren't in the
 * approved OpenAPI contract (docs/phase2/29_API_OPENAPI.yaml) yet — adding
 * them there and regenerating `schema.d.ts` is a separate follow-up, not
 * bundled into this minimal first version of the page.
 */

export type MyProviderVerificationStatus = 'PENDING' | 'VERIFIED' | 'REJECTED' | 'SUSPENDED';

export type MyProviderVerificationDocumentType =
  | 'ID_DOCUMENT'
  | 'BUSINESS_REGISTRATION'
  | 'ADDRESS_PROOF'
  | 'OTHER';

export type MyProviderVerificationDocument = {
  type: MyProviderVerificationDocumentType;
  storageKey: string;
  originalFilename: string;
  mimeType: string;
  uploadedAt: string;
};

export type MyProvider = {
  id: string;
  legalName: string;
  displayName: string;
  slug: string;
  category: string | null;
  taxId: string | null;
  verificationStatus: MyProviderVerificationStatus;
  verificationDocuments: MyProviderVerificationDocument[];
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

/** `PATCH providers/me` — currently only `taxId` (UpdateProviderDto). */
export async function updateMyProvider(accessToken: string, input: { taxId?: string }): Promise<MyProvider> {
  const response = await fetch(backendUrl('providers/me'), {
    method: 'PATCH',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(input),
    cache: 'no-store',
  });
  return jsonOrThrow<MyProvider>(response);
}

/**
 * `POST providers/me/verification-documents` — multipart passthrough. The
 * caller (the BFF route handler) already has a `FormData` parsed from the
 * incoming request; this forwards it as-is rather than re-encoding it, so
 * the file bytes are never buffered into a JS string in between.
 */
export async function uploadMyVerificationDocument(accessToken: string, formData: FormData): Promise<MyProvider> {
  const response = await fetch(backendUrl('providers/me/verification-documents'), {
    method: 'POST',
    headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` },
    body: formData,
    cache: 'no-store',
  });
  return jsonOrThrow<MyProvider>(response);
}
