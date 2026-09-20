import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { LinkButton } from '@/components/ui/LinkButton';

const INVENTORY = ['featured', 'category', 'eventSponsor', 'native', 'referral'] as const;
const AUDIENCES = ['education', 'technology', 'business', 'creative', 'hospitality'] as const;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'advertisePage' });
  return { title: t('metaTitle'), description: t('metaDescription') };
}

export default async function AdvertisePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('advertisePage');

  return (
    <main id="main-content" className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:py-16">
      <div className="max-w-4xl">
        <span className="rounded-full bg-warning-bg px-3 py-1 text-caption font-semibold text-warning">{t('badge')}</span>
        <h1 className="mt-6 font-display text-[44px] font-semibold leading-tight text-text-primary sm:text-[60px]">{t('title')}</h1>
        <p className="mt-5 max-w-3xl text-body text-text-secondary">{t('intro')}</p>
      </div>

      <section className="mt-14">
        <h2 className="font-display text-h2 text-text-primary">{t('inventoryTitle')}</h2>
        <div className="mt-8 divide-y divide-border border-y border-border">
          {INVENTORY.map((item) => (
            <article key={item} className="grid gap-4 py-6 md:grid-cols-[1fr_1.2fr_0.8fr] md:items-start">
              <div>
                <span className="text-caption font-semibold uppercase tracking-wide text-primary">{t(`inventory.${item}.label`)}</span>
                <h3 className="mt-2 font-display text-h3 text-text-primary">{t(`inventory.${item}.title`)}</h3>
              </div>
              <p className="text-small text-text-secondary">{t(`inventory.${item}.body`)}</p>
              <p className="text-small font-semibold text-text-primary">{t(`inventory.${item}.pricing`)}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-14 grid gap-10 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <h2 className="font-display text-h2 text-text-primary">{t('audienceTitle')}</h2>
          <p className="mt-3 text-body text-text-secondary">{t('audienceBody')}</p>
        </div>
        <div className="flex flex-wrap content-start gap-3">
          {AUDIENCES.map((audience) => (
            <span key={audience} className="rounded-full border border-border-strong bg-surface px-4 py-2 text-small text-text-primary">
              {t(`audiences.${audience}`)}
            </span>
          ))}
        </div>
      </section>

      <section className="mt-14 rounded-lg bg-primary p-6 text-primary-on sm:p-10">
        <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <p className="text-label font-semibold uppercase tracking-[0.16em] opacity-75">{t('trustEyebrow')}</p>
            <h2 className="mt-3 font-display text-h2">{t('trustTitle')}</h2>
            <p className="mt-4 max-w-3xl text-small opacity-80">{t('trustBody')}</p>
          </div>
          <LinkButton href="/partners" variant="secondary" className="border-primary-on bg-transparent text-primary-on hover:bg-oil-900">
            {t('cta')}
          </LinkButton>
        </div>
      </section>
    </main>
  );
}
