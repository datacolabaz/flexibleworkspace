import 'server-only';

export type AdminRoom = {
  id: string;
  name: string;
  status: 'DRAFT' | 'ACTIVE' | 'INACTIVE';
  capacityMin: number;
  capacityMax: number;
  basePriceAmount: string;
  basePriceCurrency: string;
  updatedAt: string;
  locationName: string | null;
  city: string | null;
  providerName: string | null;
};

export type AdminAuditEntry = {
  id: string;
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  beforeState: Record<string, unknown> | null;
  afterState: Record<string, unknown> | null;
  reason: string | null;
  createdAt: string;
  revertedAuditLogId?: string | null;
};

export type AdminUser = {
  id: string;
  email: string | null;
  phone: string | null;
  displayName: string | null;
  suspended?: boolean;
  roles?: Array<{ role: string; providerId: string | null }>;
};

export type CorrectRoomInput = {
  name?: string;
  description?: string;
  capacityMin?: number;
  capacityMax?: number;
  basePriceAmount?: number;
  status?: AdminRoom['status'];
  reason: string;
};

export class AdminApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AdminApiError';
  }
}

function backendUrl(path: string) {
  const baseUrl = process.env.BACKEND_API_URL;
  if (!baseUrl) throw new Error('BACKEND_API_URL is not set.');
  return `${baseUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
}

async function adminFetch<T>(accessToken: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(backendUrl(path), {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      Authorization: `Bearer ${accessToken}`,
      ...init?.headers,
    },
    cache: 'no-store',
  });

  const body = (await response.json().catch(() => undefined)) as
    | { error?: { code?: string; message?: string } }
    | T
    | undefined;

  if (!response.ok) {
    const error = body as { error?: { code?: string; message?: string } } | undefined;
    throw new AdminApiError(
      response.status,
      error?.error?.code ?? 'ADMIN_API_ERROR',
      error?.error?.message ?? 'Admin request failed.',
    );
  }

  return body as T;
}

export function assertAdminAccess(accessToken: string) {
  return adminFetch<unknown>(accessToken, 'admin/search?q=admin');
}

export function listAdminRooms(accessToken: string, query?: string) {
  const suffix = query?.trim() ? `?q=${encodeURIComponent(query.trim())}` : '';
  return adminFetch<AdminRoom[]>(accessToken, `admin/rooms${suffix}`);
}

export function correctAdminRoom(accessToken: string, roomId: string, input: CorrectRoomInput) {
  return adminFetch<AdminRoom>(accessToken, `admin/rooms/${encodeURIComponent(roomId)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function listAdminAudit(accessToken: string) {
  return adminFetch<AdminAuditEntry[]>(accessToken, 'admin/audit-log');
}

export function listAdminUsers(accessToken: string, query?: string) {
  const suffix = query?.trim() ? `?q=${encodeURIComponent(query.trim())}` : '';
  return adminFetch<AdminUser[]>(accessToken, `admin/users${suffix}`);
}
