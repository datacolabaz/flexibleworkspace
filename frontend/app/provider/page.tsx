import { Logo } from '@/components/ui/Logo';
import Link from 'next/link';

// Placeholder — the provider dashboard itself is unbuilt. Proves routing
// only: /provider resolves outside the [locale] tree, per
// 06_INFORMATION_ARCHITECTURE.md §6.2.
export default function ProviderHome() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-4 px-4 text-center">
      <Link href="/az" aria-label="Spotva ana səhifə" title="Spotva ana səhifə">
        <Logo variant="auto" height={32} />
      </Link>
      <h1 className="font-display text-h2 text-text-primary">Provider dashboard</h1>
      <p className="text-body text-text-secondary">Not built yet — this route exists to prove the routing split.</p>
      <Link href="/az" className="rounded-md bg-accent px-5 py-3 text-label text-accent-on transition-colors hover:bg-accent-hover">
        Ana səhifəyə qayıt
      </Link>
    </main>
  );
}
