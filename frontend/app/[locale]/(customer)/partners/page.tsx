import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { LinkButton } from '@/components/ui/LinkButton';

const PARTNERS = [
  { key: 'metbuat', name: 'Mətbuat.az', url: 'https://metbuat.az/' },
  { key: 'mentorix', name: 'Mentorix.io', url: 'https://mentorix.io/' },
  { key: 'saytaz', name: 'Sayt.az', url: 'https://sayt.az/' },
] as const;
const PRINCIPLES = ['disclosure', 'organic', 'measurement'] as const;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'partnersPage' });
  return { title: t('metaTitle'), description: t('metaDescription') };
}

export default async function PartnersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('partnersPage');

  return (
    <main id="main-content">
      <section className="border-b border-border bg-primary text-primary-on">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:py-24">
          <p className="text-label font-semibold uppercase tracking-[0.18em] opacity-75">{t('eyebrow')}</p>
          <h1 className="mt-4 max-w-4xl font-display text-[44px] font-semibold leading-tight sm:text-[64px]">{t('title')}</h1>
          <p className="mt-6 max-w-2xl text-body opacity-80 sm:text-xl">{t('intro')}</p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <div className="grid gap-px overflow-hidden rounded-lg border border-border bg-border lg:grid-cols-3">
          {PARTNERS.map((partner) => (
            <article key={partner.key} className="flex min-h-[360px] flex-col bg-surface p-7">
              <span className="w-fit rounded-full bg-surface-elevated px-3 py-1 text-caption font-semibold text-primary">
                {t(`items.${partner.key}.type`)}
              </span>
              <h2 className="mt-6 font-display text-h2 text-text-primary">{partner.name}</h2>
              <p className="mt-4 text-small text-text-secondary">{t(`items.${partner.key}.role`)}</p>
              <div className="mt-6 border-t border-border pt-5">
                <p className="text-caption font-semibold uppercase tracking-wide text-text-muted">{t('placementLabel')}</p>
                <p className="mt-2 text-small text-text-secondary">{t(`items.${partner.key}.placement`)}</p>
              </div>
              <a
                href={partner.url}
                target="_blank"
                rel="noreferrer"
                className="mt-auto pt-8 text-label font-semibold text-primary hover:text-text-primary"
              >
                {t('visit')} ↗
              </a>
            </article>
          ))}
        </div>
      </section>

      <section className="border-y border-border bg-surface">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
          <h2 className="font-display text-h2 text-text-primary">{t('principlesTitle')}</h2>
          <div className="mt-8 grid gap-8 md:grid-cols-3">
            {PRINCIPLES.map((principle, index) => (
              <div key={principle} className="border-t-2 border-primary pt-5">
                <span className="text-caption font-semibold text-text-muted">0{index + 1}</span>
                <h3 className="mt-4 font-display text-h3 text-text-primary">{t(`principles.${principle}.title`)}</h3>
                <p className="mt-2 text-small text-text-secondary">{t(`principles.${principle}.body`)}</p>
              </div>
            ))}
          </div>
          <div className="mt-10">
            <LinkButton href="/advertise">{t('cta')}</LinkButton>
          </div>
        </div>
      </section>
    </main>
  );
}
