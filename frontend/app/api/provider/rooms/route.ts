import { NextRequest, NextResponse } from 'next/server';
import {
  listMyRooms,
  createMyRoom,
  listRoomTypes,
  getMediaCapabilities,
  ProviderRoomsApiError,
  type CreateRoomInput,
} from '@/lib/api-client/provider-rooms';
import { readSession } from '@/lib/auth/session';

function errorResponse(error: unknown) {
  if (error instanceof ProviderRoomsApiError) {
    return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.status });
  }
  console.error('Provider rooms BFF route error:', error);
  return NextResponse.json(
    { error: { code: 'BFF_INTERNAL_ERROR', message: 'Request failed. Please try again.' } },
    { status: 502 },
  );
}

function tokenOrNull(request: NextRequest) {
  return readSession(request.cookies).accessToken ?? null;
}

/** `?types=1` returns the room-type taxonomy, `?capabilities=1` this provider's media (photo/video) limits, instead of the room list — kept on this same route rather than new files, since all three are simple provider-authenticated GETs the "Add a room" / media UI need together. */
export async function GET(request: NextRequest) {
  const accessToken = tokenOrNull(request);
  if (!accessToken) {
    return NextResponse.json({ error: { code: 'UNAUTHENTICATED', message: 'Sign in required.' } }, { status: 401 });
  }
  try {
    if (request.nextUrl.searchParams.get('types') === '1') {
      return NextResponse.json(await listRoomTypes(accessToken));
    }
    if (request.nextUrl.searchParams.get('capabilities') === '1') {
      return NextResponse.json(await getMediaCapabilities(accessToken));
    }
    return NextResponse.json(await listMyRooms(accessToken));
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
    const body = (await request.json()) as CreateRoomInput;
    return NextResponse.json(await createMyRoom(accessToken, body));
  } catch (error) {
    return errorResponse(error);
  }
}
