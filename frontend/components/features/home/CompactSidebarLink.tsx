import { Link } from '@/lib/i18n/navigation';

export function CompactSidebarLink({
  eyebrow,
  title,
  href,
  cta,
}: {
  eyebrow: string;
  title: string;
  href: string;
  cta: string;
}) {
  return (
    <Link
      href={href}
      className="block rounded-lg border border-border bg-surface px-4 py-3 shadow-sm hover:border-primary"
    >
      <p className="text-caption font-semibold uppercase tracking-[0.14em] text-primary">{eyebrow}</p>
      <p className="mt-1 font-display text-h4 text-text-primary">{title}</p>
      <p className="mt-1 text-label font-semibold text-primary">{cta} →</p>
    </Link>
  );
}
