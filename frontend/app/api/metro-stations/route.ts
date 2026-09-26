import { NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_API_URL ?? '';

/**
 * Public proxy: GET /metro-stations — passes through without auth since
 * the backend endpoint is @Public(). Used by LocationForm (provider
 * onboarding) and search filters.
 */
export async function GET() {
  try {
    const response = await fetch(`${BACKEND_URL.replace(/\/$/, '')}/metro-stations`, {
      cache: 'no-store',
    });
    if (!response.ok) {
      return NextResponse.json([]);
    }
    const data = await response.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json([]);
  }
}
