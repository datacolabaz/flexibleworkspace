import { NextRequest, NextResponse } from 'next/server';
import { getMyPlanUpgradeRequest, requestPlanUpgrade, PlanUpgradeRequestApiError } from '@/lib/api-client/plan-upgrade-requests';
import { readSession } from '@/lib/auth/session';

function errorResponse(error: unknown) {
  if (error instanceof PlanUpgradeRequestApiError) {
    return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.status });
  }
  console.error('Provider plan-upgrade-request BFF route error:', error);
  return NextResponse.json(
    { error: { code: 'BFF_INTERNAL_ERROR', message: 'Plan upgrade request failed. Please try again.' } },
    { status: 502 },
  );
}

/** `GET /api/provider/plan-upgrade-request` — the calling provider's own open request, used by `ProviderPlanPanel` to show "sorğu göndərilib" instead of the form. */
export async function GET(request: NextRequest) {
  const accessToken = readSession(request.cookies).accessToken ?? null;
  if (!accessToken) {
    return NextResponse.json({ error: { code: 'UNAUTHENTICATED', message: 'Sign in required.' } }, { status: 401 });
  }
  try {
    return NextResponse.json(await getMyPlanUpgradeRequest(accessToken));
  } catch (error) {
    return errorResponse(error);
  }
}

/** `POST /api/provider/plan-upgrade-request` — ask an admin to move the provider to a higher plan. */
export async function POST(request: NextRequest) {
  const accessToken = readSession(request.cookies).accessToken ?? null;
  if (!accessToken) {
    return NextResponse.json({ error: { code: 'UNAUTHENTICATED', message: 'Sign in required.' } }, { status: 401 });
  }
  try {
    const body = (await request.json().catch(() => ({}))) as { note?: string };
    return NextResponse.json(await requestPlanUpgrade(accessToken, body.note));
  } catch (error) {
    return errorResponse(error);
  }
}
