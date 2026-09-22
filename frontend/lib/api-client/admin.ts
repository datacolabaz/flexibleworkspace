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
  isActive: boolean;
  roles?: Array<{ role: string; providerId: string | null }>;
};

export type AdminProviderVerificationStatus = 'PENDING' | 'VERIFIED' | 'REJECTED' | 'SUSPENDED';

export type AdminProviderVerificationDocumentType =
  | 'ID_DOCUMENT'
  | 'BUSINESS_REGISTRATION'
  | 'ADDRESS_PROOF'
  | 'OTHER';

export type AdminProviderVerificationDocument = {
  type: AdminProviderVerificationDocumentType;
  storageKey: string;
  originalFilename: string;
  mimeType: string;
  uploadedAt: string;
};

export type AdminProvider = {
  id: string;
  legalName: string;
  displayName: string;
  slug: string;
  ownerUserId: string;
  category: string | null;
  taxId: string | null;
  verificationStatus: AdminProviderVerificationStatus;
  planTier: 'FREE' | 'STARTER' | 'PRO' | 'ENTERPRISE';
  verificationDocuments: AdminProviderVerificationDocument[];
  createdAt: string;
  updatedAt: string;
};

export type AdminSummary = {
  totalRooms: number;
  activeRooms: number;
  draftRooms: number;
  totalUsers: number;
  bookingsToday: number;
};

export type AdminPricingSetting = {
  id?: string;
  settingKey: string;
  percentage: string;
  minimumPriceAmount: string;
  currency: string;
  updatedBy?: string | null;
  updatedAt?: string | null;
};

export type AdminAnalyticsOverview = {
  periodDays: number;
  totalViews: number;
  uniqueVisitors: number;
  todayViews: number;
  todayUniqueVisitors: number;
  topPages: Array<{ path: string; views: number }>;
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

export type AdminTokenPair = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
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

export async function loginWithAdminPassword(email: string, password: string): Promise<AdminTokenPair> {
  const response = await fetch(backendUrl('auth/admin-password'), {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
    cache: 'no-store',
  });
  const body = (await response.json().catch(() => undefined)) as
    | { error?: { code?: string; message?: string } }
    | AdminTokenPair
    | undefined;
  if (!response.ok) {
    const error = body as { error?: { code?: string; message?: string } } | undefined;
    throw new AdminApiError(
      response.status,
      error?.error?.code ?? 'ADMIN_LOGIN_FAILED',
      error?.error?.message ?? 'Admin login failed.',
    );
  }
  return body as AdminTokenPair;
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

export function setAdminUserSuspended(accessToken: string, userId: string, suspended: boolean, reason: string) {
  return adminFetch<AdminUser>(accessToken, `admin/users/${encodeURIComponent(userId)}/suspend`, {
    method: 'POST',
    body: JSON.stringify({ suspended, reason }),
  });
}

export function getAdminSummary(accessToken: string) {
  return adminFetch<AdminSummary>(accessToken, 'admin/dashboard/summary');
}

export function getAdminPricing(accessToken: string) {
  return adminFetch<AdminPricingSetting>(accessToken, 'admin/pricing/default');
}

export function getAdminAnalytics(accessToken: string) {
  return adminFetch<AdminAnalyticsOverview>(accessToken, 'admin/analytics/overview');
}

export function updateAdminPricing(accessToken: string, input: { percentage: number; minimumPriceAmount: number; reason: string }) {
  return adminFetch<AdminPricingSetting>(accessToken, 'admin/pricing/default', {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function listAdminProviders(accessToken: string, verificationStatus?: AdminProviderVerificationStatus) {
  const suffix = verificationStatus ? `?verificationStatus=${encodeURIComponent(verificationStatus)}` : '';
  return adminFetch<AdminProvider[]>(accessToken, `admin/providers${suffix}`);
}

export function verifyAdminProvider(accessToken: string, providerId: string, decision: 'VERIFIED' | 'REJECTED', notes?: string) {
  return adminFetch<AdminProvider>(accessToken, `admin/providers/${encodeURIComponent(providerId)}/verify`, {
    method: 'POST',
    body: JSON.stringify({ decision, notes }),
  });
}

export function setAdminProviderSuspended(accessToken: string, providerId: string, suspended: boolean, notes?: string) {
  return adminFetch<AdminProvider>(accessToken, `admin/providers/${encodeURIComponent(providerId)}/suspend`, {
    method: 'PATCH',
    body: JSON.stringify({ suspended, notes }),
  });
}

/**
 * Binary passthrough — verification documents are never publicly served
 * (backend PRIVATE_STORAGE_PROVIDER), so this hits the same admin-only,
 * bearer-authenticated backend route the BFF proxies everything else
 * through, but returns the raw bytes instead of parsing JSON.
 */
export async function downloadAdminProviderVerificationDocument(
  accessToken: string,
  providerId: string,
  storageKey: string,
): Promise<{ body: ArrayBuffer; contentType: string; contentDisposition: string | null }> {
  const response = await fetch(
    backendUrl(
      `admin/providers/${encodeURIComponent(providerId)}/verification-documents/${encodeURIComponent(storageKey)}`,
    ),
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    },
  );

  if (!response.ok) {
    let code = 'ADMIN_API_ERROR';
    let message = 'Admin request failed.';
    try {
      const body = (await response.json()) as { error?: { code?: string; message?: string } };
      code = body?.error?.code ?? code;
      message = body?.error?.message ?? message;
    } catch {
      // Non-JSON error body — fall back to the defaults above.
    }
    throw new AdminApiError(response.status, code, message);
  }

  return {
    body: await response.arrayBuffer(),
    contentType: response.headers.get('content-type') ?? 'application/octet-stream',
    contentDisposition: response.headers.get('content-disposition'),
  };
}

