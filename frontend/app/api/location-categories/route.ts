import { NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_API_URL ?? '';

/**
 * Public proxy: GET /location-categories — passes through without auth
 * since the backend endpoint is @Public(). Used by ListYourSpaceForm to
 * load the seeded provider category taxonomy at registration time.
 */
export async function GET() {
  try {
    const response = await fetch(`${BACKEND_URL.replace(/\/$/, '')}/location-categories`, {
      cache: 'no-store',
    });
    if (!response.ok) {
      return NextResponse.json([], { status: 200 });
    }
    const data = await response.json();
    return NextResponse.json(data);
  } catch {
    // Return empty array so the frontend falls back to the static list
    return NextResponse.json([]);
  }
}
