import { NextRequest, NextResponse } from 'next/server';
import {
  AdminApiError,
  assertAdminAccess,
  correctAdminRoom,
  downloadAdminProviderVerificationDocument,
  getAdminPricing,
  getAdminAnalytics,
  getAdminSummary,
  listAdminAudit,
  listAdminRooms,
  listAdminUsers,
  listAdminProviders,
  verifyAdminProvider,
  setAdminProviderSuspended,
  setAdminUserSuspended,
  updateAdminPricing,
  type CorrectRoomInput,
  type AdminProviderVerificationStatus,
} from '@/lib/api-client/admin';
import { readSession } from '@/lib/auth/session';

function errorResponse(error: unknown) {
  if (error instanceof AdminApiError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  }
  console.error('Admin BFF route error:', error);
  return NextResponse.json(
    { error: { code: 'BFF_INTERNAL_ERROR', message: 'Admin request failed. Please try again.' } },
    { status: 502 },
  );
}

async function tokenOrUnauthorized(request: NextRequest) {
  const { accessToken } = readSession(request.cookies);
  if (!accessToken) {
    return null;
  }
  return accessToken;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const accessToken = await tokenOrUnauthorized(request);
  if (!accessToken) {
    return NextResponse.json(
      { error: { code: 'UNAUTHENTICATED', message: 'Admin sign-in required.' } },
      { status: 401 },
    );
  }

  try {
    const { path } = await params;
    // Binary passthrough — checked before the string-key routes below,
    // since it has its own dynamic segments (:id/:storageKey) rather than
    // one fixed key. Verification documents are never publicly served
    // (backend PRIVATE_STORAGE_PROVIDER), so this is the only way an admin
    // can view one: browser navigates here with the admin's own session
    // cookie, this route resolves that to a bearer token and streams the
    // file back.
    if (path.length === 4 && path[0] === 'providers' && path[2] === 'verification-documents') {
      const { body, contentType, contentDisposition } = await downloadAdminProviderVerificationDocument(
        accessToken,
        path[1],
        path[3],
      );
      return new NextResponse(body, {
        headers: {
          'Content-Type': contentType,
          ...(contentDisposition ? { 'Content-Disposition': contentDisposition } : {}),
          'Cache-Control': 'private, no-store',
        },
      });
    }

    const key = path.join('/');
    if (key === 'rooms') {
      return NextResponse.json(await listAdminRooms(accessToken, request.nextUrl.searchParams.get('q') ?? undefined));
    }
    if (key === 'audit-log') {
      return NextResponse.json(await listAdminAudit(accessToken));
    }
    if (key === 'users') {
      return NextResponse.json(await listAdminUsers(accessToken, request.nextUrl.searchParams.get('q') ?? undefined));
    }
    if (key === 'dashboard/summary') {
      return NextResponse.json(await getAdminSummary(accessToken));
    }
    if (key === 'pricing/default') {
      return NextResponse.json(await getAdminPricing(accessToken));
    }
    if (key === 'analytics/overview') {
      return NextResponse.json(await getAdminAnalytics(accessToken));
    }
    if (key === 'providers') {
      const status = request.nextUrl.searchParams.get('verificationStatus') as AdminProviderVerificationStatus | null;
      return NextResponse.json(await listAdminProviders(accessToken, status ?? undefined));
    }
    if (key === 'access') {
      await assertAdminAccess(accessToken);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Admin endpoint not found.' } }, { status: 404 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const accessToken = await tokenOrUnauthorized(request);
  if (!accessToken) {
    return NextResponse.json(
      { error: { code: 'UNAUTHENTICATED', message: 'Admin sign-in required.' } },
      { status: 401 },
    );
  }

  try {
    const { path } = await params;
    if (path.length === 2 && path[0] === 'rooms') {
      const body = (await request.json()) as CorrectRoomInput;
      return NextResponse.json(await correctAdminRoom(accessToken, path[1], body));
    }
    if (path.length === 2 && path[0] === 'pricing' && path[1] === 'default') {
      return NextResponse.json(await updateAdminPricing(accessToken, await request.json()));
    }
    if (path.length === 3 && path[0] === 'providers' && path[2] === 'suspend') {
      const body = (await request.json()) as { suspended: boolean; notes?: string };
      return NextResponse.json(await setAdminProviderSuspended(accessToken, path[1], body.suspended, body.notes));
    }
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Admin endpoint not found.' } }, { status: 404 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const accessToken = await tokenOrUnauthorized(request);
  if (!accessToken) return NextResponse.json({ error: { code: 'UNAUTHENTICATED', message: 'Admin sign-in required.' } }, { status: 401 });
  try {
    const { path } = await params;
    if (path.length === 3 && path[0] === 'users' && path[2] === 'suspend') {
      const body = (await request.json()) as { suspended: boolean; reason: string };
      return NextResponse.json(await setAdminUserSuspended(accessToken, path[1], body.suspended, body.reason));
    }
    if (path.length === 3 && path[0] === 'providers' && path[2] === 'verify') {
      const body = (await request.json()) as { decision: 'VERIFIED' | 'REJECTED'; notes?: string };
      return NextResponse.json(await verifyAdminProvider(accessToken, path[1], body.decision, body.notes));
    }
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Admin endpoint not found.' } }, { status: 404 });
  } catch (error) {
    return errorResponse(error);
  }
}
