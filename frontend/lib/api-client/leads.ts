import 'server-only';

/**
 * Raw-fetch client for Lead Tracking (Sprint 3), same pattern as
 * `admin.ts`/`provider-dashboard.ts` rather than the typed openapi-fetch
 * client in `client.ts`: `spaces/:roomId/leads` and `provider/leads*`
 * aren't in the approved OpenAPI contract (docs/phase2/29_API_OPENAPI.yaml)
 * yet — adding them there and regenerating `schema.d.ts` is a separate
 * follow-up, not bundled into this feature pass.
 */

export type LeadStatus = 'NEW' | 'CONTACTED' | 'CONVERTED' | 'CLOSED';

export type Lead = {
  id: string;
  roomId: string;
  providerId: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  message: string | null;
  status: LeadStatus;
  createdAt: string;
  contactedAt: string | null;
  contactedByUserId: string | null;
};

export class LeadsApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'LeadsApiError';
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
    throw new LeadsApiError(
      response.status,
      error?.error?.code ?? 'LEADS_API_ERROR',
      error?.error?.message ?? 'Lead request failed.',
    );
  }
  return body as T;
}

export type CreateLeadInput = {
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  message?: string;
};

/** `POST spaces/:roomId/leads` — public, no auth. A visitor expressing interest in a room without booking/paying. */
export async function submitLead(roomId: string, input: CreateLeadInput): Promise<Lead> {
  const response = await fetch(backendUrl(`spaces/${encodeURIComponent(roomId)}/leads`), {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    cache: 'no-store',
  });
  return jsonOrThrow<Lead>(response);
}

/** `GET provider/leads` — the calling provider's own leads, most recent first. */
export async function listMyLeads(accessToken: string): Promise<Lead[]> {
  const response = await fetch(backendUrl('provider/leads'), {
    headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  return jsonOrThrow<Lead[]>(response);
}

/** `PATCH provider/leads/:id/status` — mark a lead as contacted/converted/closed. */
export async function updateLeadStatus(accessToken: string, leadId: string, status: LeadStatus): Promise<Lead> {
  const response = await fetch(backendUrl(`provider/leads/${encodeURIComponent(leadId)}/status`), {
    method: 'PATCH',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ status }),
    cache: 'no-store',
  });
  return jsonOrThrow<Lead>(response);
}
