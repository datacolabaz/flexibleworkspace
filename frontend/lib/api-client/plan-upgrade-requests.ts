import 'server-only';

/**
 * Raw-fetch client for Plan Upgrade Requests, same pattern as
 * `leads.ts`/`provider-dashboard.ts`: `provider/plan-upgrade-request`
 * isn't in the approved OpenAPI contract yet, so this talks to the
 * backend directly rather than through the typed `client.ts`.
 *
 * Part of the FREE/PRO plan feature — built with NO live payment
 * integration (per the user's explicit choice): a provider asks for a
 * higher plan here, and an admin grants it by hand from the admin panel
 * (`admin/page.tsx`'s "Yüksəltmə sorğuları" section). Mirrors
 * `LeadsModule`'s "supply first, high-touch ops" pattern.
 */

export type PlanUpgradeRequestStatus = 'PENDING' | 'RESOLVED';

export type PlanUpgradeRequest = {
  id: string;
  providerId: string;
  note: string | null;
  status: PlanUpgradeRequestStatus;
  createdAt: string;
  resolvedAt: string | null;
  resolvedByUserId: string | null;
};

export class PlanUpgradeRequestApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'PlanUpgradeRequestApiError';
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
    throw new PlanUpgradeRequestApiError(
      response.status,
      error?.error?.code ?? 'PLAN_UPGRADE_REQUEST_API_ERROR',
      error?.error?.message ?? 'Plan upgrade request failed.',
    );
  }
  return body as T;
}

/** `GET provider/plan-upgrade-request` — the calling provider's own open request, or null if there isn't one. */
export async function getMyPlanUpgradeRequest(accessToken: string): Promise<PlanUpgradeRequest | null> {
  const response = await fetch(backendUrl('provider/plan-upgrade-request'), {
    headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  return jsonOrThrow<PlanUpgradeRequest | null>(response);
}

/** `POST provider/plan-upgrade-request` — idempotent on the backend: re-submitting while a request is already open just returns that same one. */
export async function requestPlanUpgrade(accessToken: string, note?: string): Promise<PlanUpgradeRequest> {
  const response = await fetch(backendUrl('provider/plan-upgrade-request'), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ note }),
    cache: 'no-store',
  });
  return jsonOrThrow<PlanUpgradeRequest>(response);
}
