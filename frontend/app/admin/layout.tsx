import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { AdminApiError, assertAdminAccess } from '@/lib/api-client/admin';
import { readSession } from '@/lib/auth/session';
import '../globals.css';

// Independent root layout — see app/[locale]/layout.tsx's comment on
// Next.js's "multiple root layouts" pattern. /admin/* is deliberately
// NOT locale-prefixed (06_INFORMATION_ARCHITECTURE.md §6.3).

export const metadata: Metadata = {
  title: 'Spotva Admin',
};

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { accessToken } = readSession(await cookies());
  if (!accessToken) redirect('/az/login?redirect=%2Fadmin&admin=1');

  try {
    await assertAdminAccess(accessToken);
  } catch (error) {
    if (error instanceof AdminApiError && [401, 403].includes(error.status)) {
      redirect('/az/login?redirect=%2Fadmin&admin=1');
    }
    throw error;
  }

  return (
    <html lang="az">
      <body>{children}</body>
    </html>
  );
}
