import { NextResponse } from 'next/server';
import { ApiError } from '../api-client/client';

/**
 * Turns a thrown `ApiError` (or anything else) into the same response
 * shape the backend itself would have sent — so a Route Handler acting
 * as a thin proxy doesn't have to hand-translate every possible error,
 * and the frontend UI reads the same `{error: {code, message}}` envelope
 * either way (11_API_CONTRACTS.md §11.2), whether it came straight from
 * the backend or through this BFF layer.
 */
function isForwardableApiError(
  err: unknown,
): err is { status: number; message: string; code?: string; details?: unknown } {
  if (err instanceof ApiError) return true;
  if (typeof err !== 'object' || err === null) return false;
  const candidate = err as { status?: unknown; message?: unknown };
  return typeof candidate.status === 'number' && typeof candidate.message === 'string';
}

export function apiErrorResponse(err: unknown): NextResponse {
  if (isForwardableApiError(err)) {
    console.error('BFF upstream error:', {
      status: err.status,
      code: err.code,
      message: err.message,
    });
    return NextResponse.json(
      { error: { code: err.code ?? 'UNKNOWN_ERROR', message: err.message, details: err.details } },
      { status: err.status },
    );
  }
  // Not an ApiError — the backend itself is unreachable, or something
  // failed inside this Route Handler before/after the call. Never leak
  // the raw error (stack traces, internal URLs) to the client.
  console.error('BFF route handler error:', err);
  return NextResponse.json(
    { error: { code: 'BFF_INTERNAL_ERROR', message: 'Something went wrong. Please try again.' } },
    { status: 502 },
  );
}
