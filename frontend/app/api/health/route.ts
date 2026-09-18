import { NextResponse } from 'next/server';

// Minimal liveness check for the frontend deployment itself (Vercel) —
// not a proxy to the backend's own health endpoint. app/api/ is where
// the BFF route handlers (auth cookie wrapping, §4 of
// FRONTEND_IMPLEMENTATION_PLAN.md) will live; this file is just the
// first thing in that folder, proving the /api branch stays outside the
// locale-prefixed and provider/admin route trees.
export function GET() {
  return NextResponse.json({ status: 'ok' });
}
