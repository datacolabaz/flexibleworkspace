import { NextRequest, NextResponse } from 'next/server';
import {
  listMyLocations,
  createMyLocation,
  ProviderRoomsApiError,
  type CreateLocationInput,
} from '@/lib/api-client/provider-rooms';
import { readSession } from '@/lib/auth/session';

function errorResponse(error: unknown) {
  if (error instanceof ProviderRoomsApiError) {
    return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.status });
  }
  console.error('Provider locations BFF route error:', error);
  return NextResponse.json(
    { error: { code: 'BFF_INTERNAL_ERROR', message: 'Request failed. Please try again.' } },
    { status: 502 },
  );
}

function tokenOrNull(request: NextRequest) {
  return readSession(request.cookies).accessToken ?? null;
}

export async function GET(request: NextRequest) {
  const accessToken = tokenOrNull(request);
  if (!accessToken) {
    return NextResponse.json({ error: { code: 'UNAUTHENTICATED', message: 'Sign in required.' } }, { status: 401 });
  }
  try {
    return NextResponse.json(await listMyLocations(accessToken));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  const accessToken = tokenOrNull(request);
  if (!accessToken) {
    return NextResponse.json({ error: { code: 'UNAUTHENTICATED', message: 'Sign in required.' } }, { status: 401 });
  }
  try {
    const body = (await request.json()) as CreateLocationInput;
    return NextResponse.json(await createMyLocation(accessToken, body));
  } catch (error) {
    return errorResponse(error);
  }
}
