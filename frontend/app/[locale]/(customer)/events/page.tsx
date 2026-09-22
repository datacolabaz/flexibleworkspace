import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { LinkButton } from '@/components/ui/LinkButton';

const FORMATS = ['workshop', 'training', 'seminar', 'podcast', 'community', 'corporate'] as const;
const STEPS = ['venue', 'publish', 'manage'] as const;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'eventsPage' });
  return { title: t('metaTitle'), description: t('metaDescription') };
}

export default async function EventsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('eventsPage');

  return (
    <main id="main-content">
      <section className="border-b border-border bg-surface">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:py-24">
          <span className="rounded-full bg-surface-elevated px-3 py-1 text-caption font-semibold text-primary">{t('badge')}</span>
          <h1 className="mt-6 max-w-4xl font-display text-[44px] font-semibold leading-tight text-text-primary sm:text-[64px]">{t('title')}</h1>
          <p className="mt-6 max-w-2xl text-body text-text-secondary sm:text-xl">{t('subtitle')}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <LinkButton href="/for-businesses">{t('organizerCta')}</LinkButton>
            <LinkButton href="/search?roomType=room_type.event_space" variant="secondary">{t('venueCta')}</LinkButton>
          </div>
          {/* Moved up from the bottom of the page (was easy to miss below
           * two full sections of confident feature copy) and reworded to
           * name the gap explicitly — a provider flagged that "Dərc et"/
           * "İdarə et" below read as live features (paid tickets, QR
           * check-in) when none of that exists yet; only venue search and
           * provider signup are real today. */}
          <p className="mt-6 max-w-2xl rounded-md bg-info-bg p-4 text-small text-info">{t('betaNote')}</p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <h2 className="font-display text-h2 text-text-primary">{t('formatsTitle')}</h2>
        <div className="mt-8 grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
          {FORMATS.map((format, index) => (
            <article key={format} className="min-h-44 bg-surface p-6">
              <span className="text-caption font-semibold text-primary">0{index + 1}</span>
              <h3 className="mt-5 font-display text-h3 text-text-primary">{t(`formats.${format}.title`)}</h3>
              <p className="mt-2 text-small text-text-secondary">{t(`formats.${format}.body`)}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="border-y border-border bg-surface">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
          <h2 className="font-display text-h2 text-text-primary">{t('flowTitle')}</h2>
          <ol className="mt-10 grid gap-8 md:grid-cols-3">
            {STEPS.map((step, index) => (
              <li key={step} className="border-t-2 border-primary pt-5">
                <span className="text-caption font-semibold text-text-muted">0{index + 1}</span>
                <h3 className="mt-4 font-display text-h3 text-text-primary">{t(`flow.${step}.title`)}</h3>
                <p className="mt-2 text-small text-text-secondary">{t(`flow.${step}.body`)}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </main>
  );
}
