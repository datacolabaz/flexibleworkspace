import type { JSX } from 'react';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/lib/i18n/navigation';
import { Logo } from '@/components/ui/Logo';
import { getPublicSocials } from '@/lib/api-client/ads';
import { visibleSocialLinks, type SocialNetwork } from '@/lib/site/social-links';

const SOCIAL_ICONS: Record<SocialNetwork, () => JSX.Element> = {
  instagram: InstagramIcon,
  facebook: FacebookIcon,
  tiktok: TikTokIcon,
  linkedin: LinkedInIcon,
};

const SOCIAL_LABELS: Record<SocialNetwork, 'socialInstagram' | 'socialFacebook' | 'socialTiktok' | 'socialLinkedin'> = {
  instagram: 'socialInstagram',
  facebook: 'socialFacebook',
  tiktok: 'socialTiktok',
  linkedin: 'socialLinkedin',
};

export async function SiteFooter() {
  const t = await getTranslations('footer');
  const socials = await getPublicSocials();
  const visibleSocials = visibleSocialLinks(socials);

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
          {visibleSocials.length > 0 && (
            <nav className="mt-5 flex items-center gap-3" aria-label={t('socialTitle')}>
              {visibleSocials.map((item) => {
                const Icon = SOCIAL_ICONS[item.key];
                return (
                  <a
                    key={item.key}
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-border text-text-primary hover:border-primary hover:text-primary"
                    aria-label={t(SOCIAL_LABELS[item.key])}
                  >
                    <Icon />
                  </a>
                );
              })}
            </nav>
          )}
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

function InstagramIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M14 9h3V6h-3c-2.2 0-4 1.8-4 4v2H8v3h2v7h3v-7h2.2L16 12h-3V10c0-.6.4-1 1-1Z" />
    </svg>
  );
}

function TikTokIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M14 4c.4 2.6 2 4.4 4.6 4.7v2.4c-1.5 0-2.9-.5-4.1-1.3v6.6c0 3.2-2.6 5.6-5.8 5.6S3 19.6 3 16.4c0-3.3 2.7-5.8 6-5.8.3 0 .7 0 1 .1v2.6c-.3-.1-.6-.2-1-.2-1.8 0-3.2 1.4-3.2 3.3S7.2 20 9 20s3.2-1.5 3.2-3.3V4H14Z" />
    </svg>
  );
}

function LinkedInIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M6.5 9H4v11h2.5V9ZM5.2 4C4.3 4 3.6 4.7 3.6 5.6c0 .9.7 1.6 1.6 1.6s1.6-.7 1.6-1.6C6.8 4.7 6.1 4 5.2 4ZM20 20h-2.5v-5.6c0-1.6-.6-2.6-2-2.6-1.1 0-1.7.7-2 1.4-.1.3-.1.7-.1 1.1V20H11V9h2.5v1.5c.5-.8 1.5-1.8 3.5-1.8 2.5 0 4 1.6 4 5.1V20Z" />
    </svg>
  );
}
