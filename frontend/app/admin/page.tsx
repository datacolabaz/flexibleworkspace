import { Logo } from '@/components/ui/Logo';

// Placeholder — the admin control center itself is unbuilt. Proves
// routing only: /admin resolves outside the [locale] tree, per
// 06_INFORMATION_ARCHITECTURE.md §6.3.
export default function AdminHome() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-4 px-4 text-center">
      <Logo variant="auto" height={32} />
      <h1 className="font-display text-h2 text-text-primary">Admin control center</h1>
      <p className="text-body text-text-secondary">Not built yet — this route exists to prove the scaffold&apos;s routing split.</p>
    </main>
  );
}
