import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { LinkButton } from '@/components/ui/LinkButton';

const HOST_ROWS = ['listing', 'booking', 'pro', 'featured'] as const;
const ORGANIZER_ROWS = ['free', 'paid', 'pro', 'sponsor'] as const;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'pricingPage' });
  return { title: t('metaTitle'), description: t('metaDescription') };
}

export default async function PricingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('pricingPage');

  const renderTable = (title: string, namespace: 'host' | 'organizer', keys: readonly string[]) => (
    <section>
      <h2 className="font-display text-h2 text-text-primary">{title}</h2>
      <div className="mt-6 overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full min-w-[720px] border-collapse text-left">
          <thead className="bg-surface-elevated text-small text-text-secondary">
            <tr>
              <th className="px-5 py-4 font-semibold">{t('table.model')}</th>
              <th className="px-5 py-4 font-semibold">{t('table.price')}</th>
              <th className="px-5 py-4 font-semibold">{t('table.includes')}</th>
              <th className="px-5 py-4 font-semibold">{t('table.why')}</th>
            </tr>
          </thead>
          <tbody>
            {keys.map((key) => (
              <tr key={key} className="border-t border-border align-top">
                <td className="px-5 py-5 font-semibold text-text-primary">{t(`${namespace}.rows.${key}.name`)}</td>
                <td className="whitespace-nowrap px-5 py-5 text-text-primary">{t(`${namespace}.rows.${key}.price`)}</td>
                <td className="px-5 py-5 text-small text-text-secondary">{t(`${namespace}.rows.${key}.includes`)}</td>
                <td className="px-5 py-5 text-small text-text-secondary">{t(`${namespace}.rows.${key}.why`)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );

  return (
    <main id="main-content" className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:py-16">
      <div className="max-w-4xl">
        <span className="rounded-full bg-warning-bg px-3 py-1 text-caption font-semibold text-warning">{t('pilotBadge')}</span>
        <h1 className="mt-6 font-display text-[44px] font-semibold leading-tight text-text-primary sm:text-[60px]">{t('title')}</h1>
        <p className="mt-5 max-w-3xl text-body text-text-secondary">{t('intro')}</p>
      </div>

      <div className="mt-14 space-y-14">
        {renderTable(t('host.title'), 'host', HOST_ROWS)}
        {renderTable(t('organizer.title'), 'organizer', ORGANIZER_ROWS)}
      </div>

      <section className="mt-14 grid gap-8 rounded-lg bg-primary p-6 text-primary-on sm:p-10 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <p className="text-label font-semibold uppercase tracking-[0.16em] opacity-75">{t('example.eyebrow')}</p>
          <h2 className="mt-3 font-display text-h2">{t('example.title')}</h2>
          <p className="mt-4 text-small opacity-80">{t('example.body')}</p>
        </div>
        <dl className="divide-y divide-primary-on/25 border-y border-primary-on/25">
          {(['base', 'guestFee', 'customerTotal', 'hostFee', 'hostNet', 'spotvaGross', 'processing', 'spotvaNet'] as const).map((key) => (
            <div key={key} className="flex items-center justify-between gap-6 py-3 text-small">
              <dt className="opacity-80">{t(`example.rows.${key}.label`)}</dt>
              <dd className="font-semibold">{t(`example.rows.${key}.value`)}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="mt-10 rounded-md border border-warning bg-warning-bg p-5 text-small text-warning">
        <strong>{t('legalTitle')}</strong> {t('legalBody')}
      </div>

      <div className="mt-10 flex flex-wrap gap-3">
        <LinkButton href="/list-your-space">{t('hostCta')}</LinkButton>
        <LinkButton href="/advertise" variant="secondary">{t('partnerCta')}</LinkButton>
      </div>
    </main>
  );
}
