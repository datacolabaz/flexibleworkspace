import { NextRequest, NextResponse } from 'next/server';
import {
  AdminApiError,
  assertAdminAccess,
  correctAdminRoom,
  getAdminPricing,
  getAdminAnalytics,
  getAdminSummary,
  listAdminAudit,
  listAdminRooms,
  listAdminUsers,
  setAdminUserSuspended,
  updateAdminPricing,
  type CorrectRoomInput,
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
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Admin endpoint not found.' } }, { status: 404 });
  } catch (error) {
    return errorResponse(error);
  }
}
