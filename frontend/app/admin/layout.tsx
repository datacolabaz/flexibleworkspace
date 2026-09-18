import type { Metadata } from 'next';
import '../globals.css';

// Independent root layout — see app/[locale]/layout.tsx's comment on
// Next.js's "multiple root layouts" pattern. /admin/* is deliberately
// NOT locale-prefixed (06_INFORMATION_ARCHITECTURE.md §6.3).

export const metadata: Metadata = {
  title: 'Spotva Admin',
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="az">
      <body>{children}</body>
    </html>
  );
}
