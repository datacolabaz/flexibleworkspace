import { getTranslations } from 'next-intl/server';
import { Link } from '@/lib/i18n/navigation';
import { Logo } from '@/components/ui/Logo';

export async function SiteFooter() {
  const t = await getTranslations('footer');

  const sections = [
    {
      title: t('discoverTitle'),
      links: [
        { href: '/search', label: t('spaces') },
        { href: '/events', label: t('events') },
        { href: '/how-it-works', label: t('howItWorks') },
      ],
    },
    {
      title: t('businessTitle'),
      links: [
        { href: '/for-businesses', label: t('listSpace') },
        { href: '/pricing', label: t('pricing') },
        { href: '/advertise', label: t('advertise') },
      ],
    },
    {
      title: t('ecosystemTitle'),
      links: [
        { href: '/partners', label: t('partners') },
        { href: '/privacy-policy', label: t('privacy') },
        { href: '/data-deletion', label: t('dataDeletion') },
      ],
    },
  ] as const;

  return (
    <footer className="mt-20 border-t border-border bg-surface">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.2fr_2fr]">
        <div>
          <Logo variant="auto" height={30} />
          <p className="mt-4 max-w-xs text-small text-text-secondary">{t('tagline')}</p>
        </div>
        <div className="grid gap-8 sm:grid-cols-3">
          {sections.map((section) => (
            <div key={section.title}>
              <h2 className="text-label font-semibold text-text-primary">{section.title}</h2>
              <nav className="mt-3 flex flex-col gap-2" aria-label={section.title}>
                {section.links.map((link) => (
                  <Link key={link.href} href={link.href} className="text-small text-text-secondary hover:text-primary">
                    {link.label}
                  </Link>
                ))}
              </nav>
            </div>
          ))}
        </div>
      </div>
      <div className="border-t border-border px-4 py-4 text-center text-caption text-text-muted">
        © {new Date().getFullYear()} Spotva. {t('rights')}
      </div>
    </footer>
  );
}
