import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/auth/route-helpers';

const BACKEND = process.env.BACKEND_URL ?? 'http://localhost:3001';

/**
 * POST /api/events/[id]/cover
 *
 * Accepts a multipart/form-data body with a `cover` file field and proxies
 * it to the backend POST /events/:id/cover endpoint (Feature 2 — cover image
 * upload). We forward the raw FormData so file bytes never get re-encoded.
 *
 * The backend validates MIME type (JPEG/PNG/WebP) and size (≤ 5 MiB) and
 * returns the updated EventRecord with the new coverImage URL.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { accessToken } = readSession(request.cookies);
  if (!accessToken) {
    return NextResponse.json(
      { error: { code: 'UNAUTHENTICATED', message: 'Authentication required.' } },
      { status: 401 },
    );
  }

  const { id } = await params;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: { code: 'INVALID_FORM', message: 'Multipart form data required.' } },
      { status: 400 },
    );
  }

  try {
    const res = await fetch(`${BACKEND}/events/${id}/cover`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        // Do NOT set Content-Type here — let fetch set it with the boundary.
      },
      body: formData,
    });

    const data = await res.json() as unknown;
    return NextResponse.json(data, {
      status: res.status,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
