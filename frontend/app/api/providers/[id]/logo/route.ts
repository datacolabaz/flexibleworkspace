import { NextRequest, NextResponse } from 'next/server';
import { setProviderLogo, ProviderLogoApiError } from '@/lib/api-client/providers';
import { readSession } from '@/lib/auth/session';

/**
 * Multipart passthrough for `POST providers/:id/logo`. Called as a
 * same-session follow-up right after `POST /api/providers` succeeds —
 * see `setProviderLogo`'s comment for why this takes the provider id in
 * the URL rather than resolving "my provider" from the session.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { accessToken } = readSession(request.cookies);
  if (!accessToken) {
    return NextResponse.json({ error: { code: 'UNAUTHENTICATED', message: 'Sign in required.' } }, { status: 401 });
  }
  const { id } = await params;
  try {
    const formData = await request.formData();
    return NextResponse.json(await setProviderLogo(accessToken, id, formData));
  } catch (error) {
    if (error instanceof ProviderLogoApiError) {
      return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.status });
    }
    console.error('Provider logo BFF route error:', error);
    return NextResponse.json(
      { error: { code: 'BFF_INTERNAL_ERROR', message: 'Logo upload failed. Please try again.' } },
      { status: 502 },
    );
  }
}
