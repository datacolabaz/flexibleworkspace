import type { Metadata } from 'next';
import '../globals.css';

// Independent root layout (see app/[locale]/layout.tsx's comment on
// Next.js's "multiple root layouts" pattern) — /provider/* is
// deliberately NOT locale-prefixed (06_INFORMATION_ARCHITECTURE.md §6.2).
// Provider-dashboard i18n treatment isn't specified yet; flagged as a
// follow-up rather than assumed here.

export const metadata: Metadata = {
  title: 'Spotva for Providers',
};

export default function ProviderLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="az">
      <body>{children}</body>
    </html>
  );
}
